// M3 nav/RN shell — excluded from root tsc until the Expo install lands
// (see tsconfig `exclude` + apps/mobile/README.md); remove the exclude then.
// Each maps one @takenotes/ui/native prop contract to RN primitives with
// touch-sized hit areas (minHeight 44 from targetSize.touch).
import { Text, TouchableOpacity, View } from "react-native";
import type { EmptyStateProps, ListRowProps, NoticeProps, SearchRowProps } from "@takenotes/ui/native";

export function NativeListRow({ title, detail, kind, dimmed, selected, onPress }: ListRowProps) {
  return (
    <TouchableOpacity onPress={onPress} style={{ minHeight: 44, opacity: dimmed ? 0.5 : 1 }}>
      <Text>
        {kind === "directory" ? "▸ " : ""}
        {title}
      </Text>
      {detail ? <Text>{detail}</Text> : null}
      {selected ? <Text>●</Text> : null}
    </TouchableOpacity>
  );
}

export function NativeSearchRow({ relativePath, preview, onPress }: SearchRowProps) {
  return (
    <TouchableOpacity onPress={onPress} style={{ minHeight: 44 }}>
      <Text>{relativePath}</Text>
      <Text>{preview}</Text>
    </TouchableOpacity>
  );
}

export function NativeNotice({ tone, message, actionLabel, onAction }: NoticeProps) {
  // TODO(device): map tone → theme color when theme wiring lands post-install.
  void tone;
  return (
    <View style={{ minHeight: 44 }}>
      <Text>{message}</Text>
      {actionLabel && onAction ? <Text onPress={onAction}>{actionLabel}</Text> : null}
    </View>
  );
}

export function NativeEmptyState({ title, hint, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View>
      <Text>{title}</Text>
      {hint ? <Text>{hint}</Text> : null}
      {actionLabel && onAction ? <Text onPress={onAction}>{actionLabel}</Text> : null}
    </View>
  );
}
