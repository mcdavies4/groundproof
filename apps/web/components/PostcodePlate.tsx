export function PostcodePlate({ code, size = "md" }: { code: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`plate ${size}`} aria-label={`NIPOST postcode ${code}`}>
      {code.replace(/-/g, " ")}
    </span>
  );
}
