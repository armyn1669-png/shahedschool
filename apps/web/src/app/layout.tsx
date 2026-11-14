import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "دبیرستان سید احمد خمینی | سامانه مدرسه",
  description: "درگاه آموزشی دبیرستان سید احمد خمینی",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
