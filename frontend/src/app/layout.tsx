import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Model Canvas",
  description: "A simple workspace for chatting with different AI models",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
