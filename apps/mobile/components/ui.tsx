// The shared controls for React Native. Each one asks @takenotes/ui/native
// for its style, so sizes (44pt touch), colours and radii match the other apps.
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from "react-native";
import {
  buttonStyle, cardStyle, chipStyle, fieldStyle, gap, noticeStyle, radii, rowStyle, text, touch, type ChipTone,
} from "@takenotes/ui/native";
import type { ButtonVariant, NoticeTone } from "@takenotes/ui/native";
import { useTheme } from "./theme";

export function Screen({ children }: { children: ReactNode }) {
  const { p } = useTheme();
  return <ScrollView style={{ flex: 1, backgroundColor: p.editor }} contentContainerStyle={{ padding: gap.lg, gap: gap.md }}>{children}</ScrollView>;
}

export function Title({ children }: { children: string }) {
  const { p, font } = useTheme();
  return <Text accessibilityRole="header" style={{ color: p.text, fontSize: font(text.title), fontWeight: "700" }}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const { p, font } = useTheme();
  return <Text style={{ color: muted ? p.muted : p.text2, fontSize: font(text.ui) }}>{children}</Text>;
}

export function Button({ label, onPress, variant = "default", disabled, pending, accessibilityHint }: {
  label: string; onPress: () => void; variant?: ButtonVariant; disabled?: boolean; pending?: boolean; accessibilityHint?: string;
}) {
  const { theme, font } = useTheme();
  const blocked = Boolean(disabled || pending);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: blocked, busy: pending }} onPress={() => { if (!blocked) onPress(); }}>
      {({ pressed }) => {
        const s = buttonStyle(variant, theme, { disabled, pressed });
        return (
          <View style={{ height: s.height, paddingHorizontal: s.paddingHorizontal, borderRadius: s.borderRadius, borderWidth: s.borderWidth,
            backgroundColor: s.backgroundColor, borderColor: s.borderColor, opacity: s.opacity, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: gap.sm }}>
            {pending ? <ActivityIndicator color={s.color} /> : null}
            <Text style={{ color: s.color, fontSize: font(text.ui), fontWeight: "600" }}>{label}</Text>
          </View>
        );
      }}
    </Pressable>
  );
}

export function TextField({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const { theme, p, font } = useTheme();
  const [focused, setFocused] = useState(false);
  const s = fieldStyle(theme, { invalid: Boolean(error), focused });
  return (
    <View style={{ gap: gap.xs }}>
      <Text style={{ color: p.text, fontSize: font(text.small), fontWeight: "600" }}>{label}</Text>
      <TextInput {...props} accessibilityLabel={label} placeholderTextColor={s.placeholder}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }} onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        style={{ minHeight: s.minHeight, borderRadius: s.borderRadius, borderWidth: s.borderWidth, borderColor: s.borderColor,
          backgroundColor: s.backgroundColor, color: s.color, paddingHorizontal: gap.md, fontSize: font(text.ui) }} />
      {error ? <Text accessibilityRole="alert" style={{ color: p.bad, fontSize: font(text.small) }}>{error}</Text> : null}
    </View>
  );
}

/** Warn and danger are announced; info and success are not. */
export function Banner({ tone = "info", title, message, actionLabel, onAction }: {
  tone?: NoticeTone; title: string; message?: string; actionLabel?: string; onAction?: () => void;
}) {
  const { theme, font } = useTheme();
  const s = noticeStyle(tone, theme);
  return (
    <View accessibilityRole={s.accessibilityRole} style={{ backgroundColor: s.backgroundColor, borderRadius: radii.field, padding: gap.md, gap: gap.sm }}>
      <Text style={{ color: s.color, fontSize: font(text.ui) }}><Text style={{ fontWeight: "700" }}>{title}</Text>{message ? ` ${message}` : ""}</Text>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export function Chip({ label, tone = "neutral" }: { label: string; tone?: ChipTone }) {
  const { theme, font } = useTheme();
  const s = chipStyle(tone, theme);
  return <Text style={{ alignSelf: "flex-start", backgroundColor: s.backgroundColor, color: s.color, borderRadius: radii.pill, paddingHorizontal: gap.sm, paddingVertical: 2, fontSize: font(text.small) }}>{label}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return <View style={{ ...cardStyle(theme), gap: gap.sm }}>{children}</View>;
}

/** Placeholder bars while something loads. Announced once, not animated here. */
export function Skeleton({ label, lines = 3 }: { label: string; lines?: number }) {
  const { p } = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ gap: gap.sm, padding: gap.md }}>
      {Array.from({ length: lines }, (_, i) => <View key={i} style={{ height: 12, borderRadius: radii.ctl, backgroundColor: p.hover, width: i === lines - 1 ? "60%" : "100%" }} />)}
    </View>
  );
}

export function EmptyView({ title, hint, actionLabel, onAction }: { title: string; hint?: string; actionLabel?: string; onAction?: () => void }) {
  const { p, font } = useTheme();
  return (
    <View style={{ alignItems: "center", padding: gap.xl, gap: gap.sm }}>
      <Text accessibilityRole="header" style={{ color: p.text, fontSize: font(text.title), fontWeight: "600", textAlign: "center" }}>{title}</Text>
      {hint ? <Text style={{ color: p.muted, fontSize: font(text.ui), textAlign: "center" }}>{hint}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export function Row({ title, detail, kind, dimmed, selected, onPress }: {
  title: string; detail?: string; kind?: "file" | "folder"; dimmed?: boolean; selected?: boolean; onPress: () => void;
}) {
  const { theme, p, font } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={kind === "folder" ? `${title}, folder` : title} accessibilityState={{ selected: Boolean(selected) }} onPress={onPress}>
      {({ pressed }) => (
        <View style={{ ...rowStyle(theme, { selected, pressed, dimmed }), flexDirection: "row", alignItems: "center", gap: gap.sm }}>
          <View style={{ flex: 1, justifyContent: "center", paddingVertical: gap.sm }}>
            <Text numberOfLines={1} style={{ color: p.text, fontSize: font(text.ui), fontWeight: kind === "folder" ? "600" : "400" }}>{title}</Text>
            {detail ? <Text numberOfLines={2} style={{ color: p.muted, fontSize: font(text.small) }}>{detail}</Text> : null}
          </View>
          {kind === "folder" ? <Text accessibilityElementsHidden style={{ color: p.faint, fontSize: font(text.ui) }}>›</Text> : null}
        </View>
      )}
    </Pressable>
  );
}

export const TOUCH_MIN = touch.minHit;
