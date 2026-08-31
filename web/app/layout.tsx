import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '부부 연금 종합 시뮬레이터',
  description:
    '개인정보를 서버로 보내지 않고 국민·개인·퇴직·유족연금을 함께 계산하는 부부 연금 종합 시뮬레이터',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
