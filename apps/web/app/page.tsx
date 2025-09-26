"use client";

import { useState } from "react";
import { ApiKeysForm } from "@/components/config/api-keys-form";
import { SystemConfigForm } from "@/components/config/system-config-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportConfigButton } from "@/components/config/export-config-button";

export default function ConfigPage() {
  const [activeTab, setActiveTab] = useState("system");

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Configuration</h1>
          <p className="text-muted-foreground mt-2">
            Configure your AI reaction system settings and API keys.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="system">System Configuration</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          </TabsList>

          <TabsContent value="system" className="space-y-6">
            <Card>
              <div className="flex items-center justify-between gap-6 px-6">
                <CardHeader className="flex-1 px-0">
                  <CardTitle>System Configuration</CardTitle>
                  <CardDescription>
                    Configure the behavior of the AI reaction system components.
                  </CardDescription>
                </CardHeader>
                <ExportConfigButton />
              </div>
              <CardContent>
                <SystemConfigForm />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api-keys" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>
                  Enter your OpenAI and Google API keys. These are required for
                  the system to function.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ApiKeysForm />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
