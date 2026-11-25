import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useState } from "react";

// Local storage configureation
const STORAGE_KEY = "@photo_journal_entries";

const PHOTO_DIRECTORY = new Directory(Paths.document, "journal-photos");

export default function HomeScreen() {
  //journal entries
  const [entries, setEntries] = useState([]);

  //modal and form fields
  const [modalVisible, setModalVisible] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Application status
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [location, setLocation] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  // load saved entries when the app opens
  useEffect(() => {
    loadEntries();
  }, []);

  async function getCurrentLocation() {
    try {
      setGettingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location Permission",
          "Location permission was denied. You can still save your journal entry with GPS coordinates.",
        );
        return null;
      }
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      const coordinates = {
        latitude: currentLocation.coords.latitude,
        longitute: currentLocation.coords.longitude,
      };

      setLocation(coordinates);

      return coordinates;
    } catch (error) {
      console.error(error, "Location error");
      Alert.alert("Location Error", error);
    }
  }

  async function loadEntries() {
    try {
      const savedEntries = await AsyncStorage.getItem(STORAGE_KEY);

      if (savedEntries !== null) {
        setEntries(JSON.parse(savedEntries));
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Unable to load Journal entires.");
    } finally {
      setLoading(false);
    }
  }

  async function takePhoto() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Please allow camera access to take photos.",
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        setPhoto(result.assets[0]);
      }
    } catch (error) {
      console.error(error);

      Alert.alert("Camera Error", "Unable to take a photograph.");
    }
  }
  // TODO: choosePhoto function
  async function choosePhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        setPhoto(result.assets[0]);
      }
    } catch (error) {
      console.error(error);

      Alert.alert("Photo Library Error", "Unable to select a photograph.");
    }
  }

  function getImageExtension(asset) {
    const mimeType = asset.mimeType?.toLowerCase();

    if (mimeType === "image/png") return "png";
    if (mimeType === "image/webp") return "webp";
    if (mimeType === "image/heic") return "heic";
    if (mimeType === "image/heif") return "heif";
    if (mimeType === "image/jpeg") return "jpeg";

    const extenstion = asset.fileName?.split(".").pop()?.toLowerCase();

    const allowed = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

    return allowed.includes(extenstion) ? extenstion : "jpg";
  }

  function savePhoto(asset) {
    if (!PHOTO_DIRECTORY.exists) {
      PHOTO_DIRECTORY.create({
        intermediates: true,
        idempotent: true,
      });
    }

    const extension = getImageExtension(asset);
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const source = new File(asset.uri);
    const destination = new File(PHOTO_DIRECTORY, filename);

    source.copy(destination);
    console.log("Photo saved at:", destination.uri);
    return destination.uri;
  }

  async function saveEntry() {
    if (saving) return;

    if (!photo || !title.trim()) {
      Alert.alert(
        "Missing Information",
        "Please select a photo and enter a title.",
      );
      return;
    }

    setSaving(true);

    let savePhotoUri = null;

    try {
      const coordinates = await getCurrentLocation();
      savePhotoUri = savePhoto(photo);
      const newEntry = {
        id: `$${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: title.trim(),
        description: description.trim(),
        image: savePhotoUri,
        date: new Date().toISOString(),
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitute ?? null,
      };

      const updatedEntries = [newEntry, ...entries];

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedEntries));

      setEntries(updatedEntries);
      closeModal();
    } catch (error) {
      console.error(error);

      if (savePhotoUri) {
        try {
          const file = new File(savePhotoUri);

          if (file.exists) {
            file.delete();
          }
        } catch (cleanupError) {
          console.error(cleanupError);
        }
      }

      Alert.alert("Save Error", "Unable to save your journal entry.");
    } finally {
      setSaving(false);
    }
  }

  function deleteEntry(id) {
    Alert.alert(
      "Delete Entry",
      "Are you sure you want to delete this journal entry?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const entry = entries.find((item) => item.id === id);

              const updatedEntries = entries.filter((item) => item.id !== id);

              await AsyncStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(updatedEntries),
              );

              setEntries(updatedEntries);

              if (entry?.image) {
                try {
                  const file = new File(entry.image);
                  if (file.exists) {
                    file.delete();
                  }
                } catch (fileError) {
                  console.error(fileError);
                }
              }
            } catch (error) {
              console.error(error);

              Alert.alert("Delete Error", "Unable to delete this entry.");
            }
          },
        },
      ],
    );
  }

  function openModal() {
    setPhoto(null);
    setTitle("");
    setDescription("");
    setModalVisible(true);
    setLocation(null);
  }

  function closeModal() {
    setModalVisible(false);
    setPhoto(null);
    setTitle("");
    setDescription("");
    setLocation(null);
  }

  function formatDate(date) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  function renderEntry({ item }) {
    return (
      <View style={styles.card}>
        <Image source={{ uri: item.image }} style={styles.cardImage} />
        <View style={styles.cardContent}>
          <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {item.description ? (
            <Text style={styles.cardDescription}>{item.description}</Text>
          ) : null}

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => deleteEntry(item.id)}
          >
            <Ionicons name="trash-outline" size={18} color="#C0392B" />
            <Text style={styles.deleteText}>Delete Entry</Text>
          </TouchableOpacity>
          {item.latitude != null && item.latitude != null && (
            <View style={styles.locationContainer}>
              <Ionicons name="location-outline" size={18} color="#36673" />
              <Text style={styles.locationText}>
                {`${item.latitude.toFixed(6)} ${item.longitude.toFixed(6)}`}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>Photo Journal</Text>
          <Text style={styles.subtitle}>Capture your favorite moments</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openModal}>
          <Ionicons name="add" size={28} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/*Journal Entries */}

      {loading ? (
        <ActivityIndicator
          size="large"
          color="#366B73"
          style={{ marginTop: 50 }}
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={renderEntry}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="images-outline" size={70} color="#A8B9BC" />
              <Text style={styles.emptyTitle}>No journal entries yet.</Text>
              <Text style={styles.emptyText}>
                Tap the + button eto capture your first memory.
              </Text>
            </View>
          }
        />
      )}

      {/* New Entry Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={closeModal}
        presentationStyle="fullScreen"
      >
        <SafeAreaProvider>
          <SafeAreaView style={styles.modalContainer}>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={closeModal} disabled={saving}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>

                <Text style={styles.modalTitle}>New Entry</Text>

                <TouchableOpacity onPress={saveEntry} disabled={saving}>
                  <Text style={styles.saveText}>
                    {saving ? "Saving..." : "Save"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Entry Form */}
              <ScrollView
                contentContainerStyle={styles.form}
                keyboardShouldPersistTaps="handled"
              >
                {/* Photo Preview */}
                {photo ? (
                  <Image
                    source={{ uri: photo.uri }}
                    style={styles.previewImage}
                  />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="camera-outline" size={55} color="#9AAEB2" />

                    <Text style={styles.placeholderText}>Add a photograph</Text>
                  </View>
                )}

                {/* Camera and Library Buttons */}
                <View style={styles.photoButtons}>
                  <TouchableOpacity
                    style={styles.photoButton}
                    onPress={takePhoto}
                    disabled={saving}
                  >
                    <Ionicons name="camera-outline" size={22} color="#FFFFFF" />

                    <Text style={styles.photoButtonText}>Camera</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.photoButton}
                    onPress={choosePhoto}
                    disabled={saving}
                  >
                    <Ionicons name="images-outline" size={22} color="#FFFFFF" />

                    <Text style={styles.photoButtonText}>Library</Text>
                  </TouchableOpacity>
                </View>

                {/* Title Field */}
                <Text style={styles.label}>Title</Text>

                <TextInput
                  style={styles.input}
                  placeholder="Give this memory a title"
                  value={title}
                  onChangeText={setTitle}
                  maxLength={100}
                  editable={!saving}
                />

                {/* Description Field */}
                <Text style={styles.label}>Description</Text>

                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Write about this moment..."
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  textAlignVertical="top"
                  editable={!saving}
                />
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7F6",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 20,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E4E9E8",
  },

  heading: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#243E43",
  },

  subtitle: {
    fontSize: 13,
    color: "#789094",
    marginTop: 4,
  },

  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#366B73",
    justifyContent: "center",
    alignItems: "center",
  },

  list: {
    padding: 18,
    paddingBottom: 40,
    flexGrow: 1,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 20,
    elevation: 3,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
  },

  cardImage: {
    width: "100%",
    height: 230,
  },

  cardContent: {
    padding: 18,
  },

  cardDate: {
    fontSize: 12,
    color: "#7D969A",
    marginBottom: 6,
  },

  cardTitle: {
    fontSize: 21,
    fontWeight: "bold",
    color: "#243E43",
    marginBottom: 8,
  },

  cardDescription: {
    fontSize: 15,
    color: "#52676B",
    lineHeight: 23,
    marginBottom: 12,
  },

  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    alignSelf: "flex-start",
  },

  deleteText: {
    color: "#C0392B",
    fontSize: 13,
    fontWeight: "600",
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#405A5E",
    marginTop: 20,
  },

  emptyText: {
    fontSize: 14,
    color: "#81989B",
    textAlign: "center",
    lineHeight: 22,
    marginTop: 8,
  },

  modalContainer: {
    flex: 1,
    backgroundColor: "#F5F7F6",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E4E9E8",
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#243E43",
  },

  cancelText: {
    fontSize: 16,
    color: "#789094",
  },

  saveText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#366B73",
  },

  form: {
    padding: 20,
    paddingBottom: 50,
  },

  photoPlaceholder: {
    height: 230,
    borderRadius: 14,
    backgroundColor: "#E6EDEE",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#BDCED0",
  },

  placeholderText: {
    color: "#8AA1A5",
    marginTop: 12,
    fontSize: 15,
  },

  previewImage: {
    width: "100%",
    height: 230,
    borderRadius: 14,
  },

  photoButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    marginBottom: 28,
  },

  photoButton: {
    flex: 1,
    backgroundColor: "#366B73",
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  photoButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },

  label: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#405A5E",
    marginBottom: 8,
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE5E6",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 22,
    color: "#243E43",
  },

  textArea: {
    height: 140,
    paddingTop: 14,
  },
  locationContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e439e8",
  },

  locationText: {
    fontSize: 13,
    color: "#526768",
  },
});
