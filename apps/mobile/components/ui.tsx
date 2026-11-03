import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export const colors = {
  bg: "#f6f7fb",
  card: "#ffffff",
  ink: "#171a2b",
  muted: "#6b7085",
  line: "#e6e8f0",
  primary: "#5b4cf0",
  soft: "#efedff",
  good: "#137a53",
  goodBg: "#e6f6ee",
  bad: "#b42335",
  badBg: "#fdecef",
  warn: "#9a6700",
  warnBg: "#fff5d6",
};

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  return scroll ? (
    <ScrollView
      style={s.page}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[s.page, s.content]}>{children}</View>
  );
}
export function Card({
  children,
  title,
  action,
}: PropsWithChildren<{ title?: string; action?: ReactNode }>) {
  return (
    <View style={s.card}>
      {(title || action) && (
        <View style={s.rowBetween}>
          <Text style={s.cardTitle}>{title}</Text>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}
export function Title({
  eyebrow,
  title,
  subtitle,
}: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <View style={s.titleBlock}>
      {eyebrow && <Text style={s.eyebrow}>{eyebrow}</Text>}
      <Text style={s.title}>{title}</Text>
      {subtitle && <Text style={s.muted}>{subtitle}</Text>}
    </View>
  );
}
export function Muted({ children }: PropsWithChildren) {
  return <Text style={s.muted}>{children}</Text>;
}
export function Button({
  label,
  onPress,
  disabled,
  variant = "primary",
  busy,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  busy?: boolean;
  testID?: string;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(busy) }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        s.button,
        variant === "ghost" && s.ghost,
        variant === "danger" && s.danger,
        inactive && s.disabled,
        pressed && !inactive && s.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === "primary" ? "white" : colors.primary} />
      ) : (
        <Text
          style={[
            s.buttonText,
            variant !== "primary" && { color: variant === "danger" ? colors.bad : colors.primary },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  multiline,
  maxLength,
  hint,
  autoCapitalize = "none",
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string | undefined;
  secureTextEntry?: boolean | undefined;
  keyboardType?: "default" | "email-address" | "numeric" | undefined;
  multiline?: boolean | undefined;
  maxLength?: number | undefined;
  hint?: string | undefined;
  autoCapitalize?: "none" | "sentences" | undefined;
  testID?: string | undefined;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9a9fb2"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={[s.input, multiline && s.textarea]}
      />
      {hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
}
export function Chip({
  label,
  selected,
  onPress,
}: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={[s.chip, selected && s.chipSelected]}
    >
      <Text style={[s.chipText, selected && { color: "white" }]}>{label}</Text>
    </Pressable>
  );
}
export function Badge({
  label,
  tone = "neutral",
}: { label: string; tone?: "neutral" | "good" | "bad" | "warn" | "primary" }) {
  const bg =
    tone === "good"
      ? colors.goodBg
      : tone === "bad"
        ? colors.badBg
        : tone === "warn"
          ? colors.warnBg
          : tone === "primary"
            ? colors.soft
            : "#eef0f5";
  const color =
    tone === "good"
      ? colors.good
      : tone === "bad"
        ? colors.bad
        : tone === "warn"
          ? colors.warn
          : tone === "primary"
            ? colors.primary
            : colors.muted;
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </View>
  );
}
export function Note({
  message,
  tone = "bad",
}: { message: string | null; tone?: "bad" | "good" | "warn" | "neutral" }) {
  if (!message) return null;
  const bg =
    tone === "good"
      ? colors.goodBg
      : tone === "warn"
        ? colors.warnBg
        : tone === "neutral"
          ? colors.soft
          : colors.badBg;
  const color =
    tone === "good"
      ? colors.good
      : tone === "warn"
        ? colors.warn
        : tone === "neutral"
          ? colors.primary
          : colors.bad;
  return (
    <View accessibilityRole="alert" style={[s.note, { backgroundColor: bg }]}>
      <Text style={{ color, lineHeight: 20 }}>{message}</Text>
    </View>
  );
}
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={s.center}>
      <ActivityIndicator color={colors.primary} />
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}
export function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={s.center}>
      <Text style={s.cardTitle}>{title}</Text>
      {detail && <Text style={[s.muted, { textAlign: "center" }]}>{detail}</Text>}
    </View>
  );
}
export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.muted}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}
export function Divider() {
  return <View style={s.divider} />;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: 20,
    paddingBottom: 36,
    gap: 16,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  titleBlock: { gap: 6, marginBottom: 2 },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    gap: 12,
  },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", flexShrink: 1 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  button: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  ghost: { backgroundColor: colors.soft },
  danger: { backgroundColor: colors.badBg },
  buttonText: { color: "white", fontWeight: "700", fontSize: 15, textAlign: "center" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  field: { gap: 6 },
  label: { color: colors.ink, fontWeight: "600", fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: "white",
    color: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 48,
  },
  textarea: { minHeight: 110, textAlignVertical: "top" },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  badge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  note: { borderRadius: 12, padding: 12 },
  center: { padding: 28, alignItems: "center", gap: 10 },
  detailRow: { gap: 3, paddingVertical: 5 },
  detailValue: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.line },
});
