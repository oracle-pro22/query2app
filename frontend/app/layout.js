import "./globals.css";

export const metadata = {
  title: "Query2App",
  description: "Run read-only SQL and render professional data views"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
