// src/photoPicker.ts
//
// Shared "take a photo or choose one" flow for every chat composer
// (app/staff/chats.tsx's Support + Team threads, app/(tabs)/support.tsx's
// client thread) — all three were already byte-for-byte identical
// library-only pickers; adding a camera option to each independently would
// just be a third copy of the same permission/result-shaping logic to keep
// in sync.
//
// Camera capture needs expo-image-picker's own cameraPermission plugin
// config turned on (app.json) — a native config change, so it only takes
// effect after a fresh dev-client build, not a JS reload.

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ChatPhotoInput } from './hooks';

async function fromResult(result: ImagePicker.ImagePickerResult): Promise<ChatPhotoInput | null> {
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.fileName ?? 'photo.jpg', mimeType: asset.mimeType ?? 'image/jpeg' };
}

/**
 * Silently returns null on a denied permission or a cancelled picker — same
 * as the pre-existing library-only flow this replaces (no error UI, since
 * "you decided not to attach a photo" isn't a failure).
 */
export async function pickChatPhoto(source: 'camera' | 'library'): Promise<ChatPhotoInput | null> {
  try {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return null;
      return await fromResult(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 }));
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    return await fromResult(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 }));
  } catch {
    return null;
  }
}

/** The "take photo / choose from library" prompt every composer's photo-attach button shows. */
export function promptChatPhotoSource(onPicked: (photo: ChatPhotoInput) => void): void {
  Alert.alert('Add a photo', undefined, [
    {
      text: 'Take Photo',
      onPress: async () => {
        const photo = await pickChatPhoto('camera');
        if (photo) onPicked(photo);
      },
    },
    {
      text: 'Choose from Library',
      onPress: async () => {
        const photo = await pickChatPhoto('library');
        if (photo) onPicked(photo);
      },
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
