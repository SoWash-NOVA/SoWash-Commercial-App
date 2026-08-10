// src/components/SiteSwitcher.tsx
//
// Header control for picking which site the screen is about. Hides itself when
// the client has one site, so single-site customers never see a chooser with
// one option in it.
//
// A modal rather than an inline dropdown: some clients run a dozen sites, and a
// list that long needs to scroll and to show the address underneath each name
// to be usable — several sites share a name across cities.

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Building2, Check, ChevronDown, MapPin, X } from 'lucide-react-native';
import { palette } from '../theme';
import { useAccent } from '../theme-context';
import { useSiteContext, siteLocation } from '../site-context';

export function SiteSwitcher() {
  const { accent } = useAccent();
  const { sites, selectedSiteId, selectedSite, setSelectedSiteId, isSingleSite } =
    useSiteContext();
  const [open, setOpen] = useState(false);

  if (isSingleSite || sites.length === 0) return null;

  const label = selectedSite?.site_name || 'All sites';

  const choose = (id: number | null) => {
    setSelectedSiteId(id);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={local.trigger}
        accessibilityRole="button"
        accessibilityLabel={`Change site. Currently ${label}`}
      >
        <Building2 size={14} color={accent} />
        <Text style={local.triggerText} numberOfLines={1}>
          {label}
        </Text>
        <ChevronDown size={14} color={palette.mutedLight} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={local.backdrop} onPress={() => setOpen(false)}>
          {/* Stop taps inside the sheet from closing it. */}
          <Pressable style={local.sheet} onPress={() => {}}>
            <View style={local.sheetHeader}>
              <Text style={local.sheetTitle}>Choose a site</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <X size={20} color={palette.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <Option
                title="All sites"
                subtitle={`${sites.length} sites on this account`}
                selected={selectedSiteId === null}
                accent={accent}
                onPress={() => choose(null)}
              />
              {sites.map((site) => (
                <Option
                  key={site.id}
                  title={site.site_name || `Site #${site.id}`}
                  subtitle={siteLocation(site)}
                  selected={selectedSiteId === site.id}
                  accent={accent}
                  onPress={() => choose(site.id)}
                />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Option({
  title,
  subtitle,
  selected,
  accent,
  onPress,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={local.option}>
      <View style={[local.optionIcon, selected && { backgroundColor: `${accent}18` }]}>
        {selected ? <Check size={16} color={accent} /> : <MapPin size={16} color={palette.muted} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[local.optionTitle, selected && { color: accent }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={local.optionSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const local = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    maxWidth: '100%',
  },
  triggerText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    color: palette.ink,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: palette.ink },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: { fontSize: 14, fontWeight: '800', color: palette.ink },
  optionSub: { fontSize: 12, color: palette.mutedLight, marginTop: 2, fontWeight: '600' },
});

export default SiteSwitcher;
