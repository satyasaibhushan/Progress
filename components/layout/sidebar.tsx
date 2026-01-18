"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  Folder,
  Tag,
  Sparkles,
  Settings,
  LogOut,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signOut, useSession } from "next-auth/react";

interface SidebarProps {
  onSuggestionsClick?: () => void;
  onClose?: () => void;
  isMobile?: boolean;
}

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, exact: true },
  { name: "Tasks", href: "/tasks", icon: CheckSquare },
  { name: "Habits", href: "/habits", icon: Calendar },
  { name: "Groups", href: "/groups", icon: Folder },
  { name: "Labels", href: "/labels", icon: Tag },
];

export function Sidebar({ onSuggestionsClick, onClose, isMobile }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <aside className="flex flex-col h-screen w-64 bg-white border-r border-slate-200">
      {/* Logo */}
      <div className="flex items-center justify-between p-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <span className="text-lg font-semibold">Progress</span>
        </div>
        {isMobile && onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link key={item.name} href={item.href} onClick={onClose}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3",
                  isActive && "bg-indigo-50 text-indigo-600 hover:bg-indigo-50"
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* Suggestions Button */}
      <div className="p-4">
        <Button
          onClick={onSuggestionsClick}
          className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          <Sparkles className="w-5 h-5 animate-pulse" />
          <span>Get Suggestion</span>
        </Button>
      </div>

      {/* User Section */}
      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center gap-3 px-4 py-2 mb-2">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-400 rounded-full flex items-center justify-center text-white text-sm font-medium">
            {session?.user?.name ? getInitials(session.user.name) : "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-900 truncate">
              {session?.user?.name || "User"}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {session?.user?.email || "user@example.com"}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 mb-1"
          asChild
        >
          <Link href="/settings">
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </Link>
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={() => signOut()}
        >
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </Button>
      </div>
    </aside>
  );
}
