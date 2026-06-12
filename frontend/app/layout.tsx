import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "F1 Strategy | Pit Wall",
  description: "Real-time F1 strategy dashboard with RL model recommendations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden bg-f1-bg text-f1-text">
        {children}
      </body>
    </html>
  );
}
