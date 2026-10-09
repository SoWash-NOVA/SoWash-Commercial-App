// src/components/PhotoViewerModal.tsx
//
// Full-screen, swipe-through, pinch-to-zoom photo viewer for the CLIENT Support chat (the staff
// chats have their own full-screen MediaViewerView in app/staff/chats.tsx, built on the same
// ZoomableImage). Opened by tapping a photo bubble; swipe left/right for the other photos in the
// conversation.

import React, { useRef, useState } from 'react';
import { FlatList, Modal, StatusBar, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import ZoomableImage from './ZoomableImage';
import { formatDateTime } from '../hooks';

export interface ViewerPhoto {
  id: number;
  url: string;
  senderName: string | null;
  createdAt: string;
}

export default function PhotoViewerModal({
  photos,
  initialIndex,
  onClose,
}: {
  photos: ViewerPhoto[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  // While a page is zoomed in, paging is off so a pan moves the picture, not the page.
  const [pagingEnabled, setPagingEnabled] = useState(true);
  const listRef = useRef<FlatList<ViewerPhoto>>(null);
  const current = photos[index];
  const viewportHeight = height - insets.top - insets.bottom - 70;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* A Modal is its own native root, so it needs its own GestureHandlerRootView. */}
      <GestureHandlerRootView style={st.root}>
        <StatusBar hidden={false} barStyle="light-content" />
        <View style={[st.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={st.back} hitSlop={10} accessibilityLabel="Close photo">
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={st.name} numberOfLines={1}>
              {current?.senderName || 'Photo'}
            </Text>
            {current ? <Text style={st.date}>{formatDateTime(current.createdAt)}</Text> : null}
          </View>
          {photos.length > 1 ? (
            <Text style={st.count}>
              {index + 1} / {photos.length}
            </Text>
          ) : null}
        </View>

        <FlatList
          ref={listRef}
          data={photos}
          horizontal
          pagingEnabled
          scrollEnabled={pagingEnabled}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(p) => String(p.id)}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <View style={{ width, height: viewportHeight, alignItems: 'center', justifyContent: 'center' }}>
              <ZoomableImage
                uri={item.url}
                width={width}
                height={viewportHeight}
                onZoomChange={(zoomed) => setPagingEnabled(!zoomed)}
              />
            </View>
          )}
        />
      </GestureHandlerRootView>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 10 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontSize: 16, fontWeight: '700' },
  date: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 },
  count: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
});
