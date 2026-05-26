'use client';

import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Suspense } from 'react';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F5]">
      <div className="bg-white rounded-2xl shadow-lg w-[380px] overflow-hidden">
        {/* Logo-Header */}
        <div className="bg-[#3A3A3A] px-8 py-7 flex items-center justify-center">
          <Image src="/logo.png" alt="art&design" width={200} height={40} className="h-10 w-auto brightness-0 invert" priority />
        </div>

        {/* Login */}
        <div className="px-8 py-7">
          <p className="text-sm text-muted-foreground mb-6 text-center tracking-wide">LunaHub</p>

          {error && (
            <div className="bg-red-50 text-[#890813] text-sm rounded-lg px-3 py-2.5 border border-red-100 mb-4">
              {error}
            </div>
          )}

          <a
            href="/auth/login"
            className="flex items-center justify-center w-full h-10 bg-[#890813] hover:bg-[#6d0610] text-white font-medium rounded-md transition-colors"
          >
            Mit Microsoft anmelden
          </a>
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">art&amp;design werbeagentur GmbH</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
        <div className="text-muted-foreground">Laden...</div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
