import Link from "next/link";
export default function NotFound() {
  return (
    <main className="wrap page">
      <h1>Property not found</h1>
      <p>It may have been removed, or you don&apos;t have access to it.</p>
      <Link className="btn secondary" href="/dashboard">Back to your properties</Link>
    </main>
  );
}
