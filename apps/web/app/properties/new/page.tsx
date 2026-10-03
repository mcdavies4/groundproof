import { NewPropertyForm } from "./NewPropertyForm";

export default function NewProperty() {
  return (
    <main className="wrap page" style={{ maxWidth: 560 }}>
      <h1>Add a property</h1>
      <p className="muted">
        We check the postcode with NIPOST and show you what&apos;s on record. After that, your person on the
        ground does one anchor visit with the app to lock the property to that building.
      </p>
      <NewPropertyForm />
    </main>
  );
}
