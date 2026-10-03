import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { c, s } from "./theme";

export function Button(props: {
  title: string; onPress: () => void; disabled?: boolean; busy?: boolean; secondary?: boolean;
}) {
  const { title, onPress, disabled, busy, secondary } = props;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [s.btn, secondary && s.btnSecondary, (disabled || busy) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
    >
      {busy ? <ActivityIndicator color={secondary ? c.ink : c.paper} /> : (
        <Text style={[s.btnText, secondary && s.btnSecondaryText]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Plate({ code }: { code: string }) {
  return (
    <View style={s.plate} accessibilityLabel={`NIPOST postcode ${code}`}>
      <Text style={s.plateText}>{code.replace(/-/g, " ")}</Text>
    </View>
  );
}

export const verdictColour = { verified: c.verified, review: c.review, flagged: c.flagged, pending: c.inkSoft } as const;
export const verdictLabel = {
  verified: "Verified at the building",
  review: "Needs a look",
  flagged: "Flagged",
  pending: "Checking with NIPOST",
} as const;
