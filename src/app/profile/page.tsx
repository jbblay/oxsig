"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { LockKeyhole, UserCircle, Settings, Shield, Bell, Palette, Key } from "lucide-react";

export default function ProfilePage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-md px-6"
      >
        <div className="mb-6 relative">
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              rotate: [0, -5, 5, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="inline-block"
          >
            <LockKeyhole className="h-20 w-20 text-muted-foreground/50 mx-auto" />
          </motion.div>
        </div>
        <h1 className="text-3xl font-bold mb-2">Profile Features Coming Soon</h1>
        <p className="text-muted-foreground mb-6">
          Comprehensive user profile and account management features are under development.
        </p>
        <div className="space-y-2 text-sm text-muted-foreground text-left">
          <div className="flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-amber-500" />
            <span>Avatar upload and profile customization</span>
          </div>
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-blue-500" />
            <span>Account settings and preferences</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-green-500" />
            <span>Privacy and security controls</span>
          </div>
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-purple-500" />
            <span>Notification preferences</span>
          </div>
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-pink-500" />
            <span>Theme and appearance customization</span>
          </div>
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-red-500" />
            <span>Manage cryptographic keys and DIDs</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
