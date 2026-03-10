export default function EmbeddingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Override the root layout's <main> wrapper by rendering fullscreen */}
      <style>{`
        body > nav { display: none !important; }
        body > main { max-width: none !important; padding: 0 !important; margin: 0 !important; }
      `}</style>
      {children}
    </>
  );
}
