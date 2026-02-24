import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "../ConvexClientProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DocStoreProvider } from "@/lib/doc-store";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <ConvexClientProvider>
        <TooltipProvider>
          <DocStoreProvider>{children}</DocStoreProvider>
        </TooltipProvider>
      </ConvexClientProvider>
    </ClerkProvider>
  );
}
