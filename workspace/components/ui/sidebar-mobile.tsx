"use client"

// The sidebar on a phone: a Sheet. Split from sidebar.tsx and loaded through next/dynamic there,
// so desktop first loads do not carry the dialog primitive.

import * as React from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

const SIDEBAR_WIDTH_MOBILE = "18rem"

export function MobileSidebar({
  open,
  onOpenChange,
  side = "left",
  dir,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  side?: "left" | "right"
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} {...props}>
      <SheetContent
        dir={dir}
        data-sidebar="sidebar"
        data-slot="sidebar"
        data-mobile="true"
        className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
          } as React.CSSProperties
        }
        side={side}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Sidebar</SheetTitle>
          <SheetDescription>Displays the mobile sidebar.</SheetDescription>
        </SheetHeader>
        <div className="flex h-full w-full flex-col">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
