"use client";

import * as React from "react";
import { 
  FileCheck, 
  Download, 
  Shield, 
  Calendar,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Search
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import type { AuditEvent, AuditAction } from "@/lib/audit/audit-log";
import { getAllAuditEvents } from "@/lib/db/audit";
import { exportAuditLogJSONL, exportAuditLogCSV, generateComplianceReport } from "@/lib/audit/audit-log";

const actionTypeLabels: Record<string, string> = {
  SIGN_DOCUMENT: "Document Signed",
  REVOKE_SIGNATURE: "Signature Revoked",
  CREATE_DOCUMENT: "Document Created",
  UPDATE_DOCUMENT: "Document Updated",
  DELETE_DOCUMENT: "Document Deleted",
  GRANT_ACCESS: "Access Granted",
  REVOKE_ACCESS: "Access Revoked",
  PAIR_DEVICE: "Device Paired",
  UNPAIR_DEVICE: "Device Unpaired",
  ROTATE_KEY: "Key Rotated",
  RECOVERY_INITIATED: "Recovery Initiated",
  RECOVERY_COMPLETED: "Recovery Completed",
  POLICY_VIOLATION: "Policy Violation",
  SECURITY_ALERT: "Security Alert",
  EXPORT_DATA: "Data Exported",
  LOGIN: "Login",
  LOGOUT: "Logout"
};

const getSeverityColor = (action: AuditAction) => {
  switch (action) {
    case "POLICY_VIOLATION":
    case "SECURITY_ALERT":
      return "destructive";
    case "DELETE_DOCUMENT":
    case "REVOKE_ACCESS":
    case "UNPAIR_DEVICE":
      return "default";
    default:
      return "secondary";
  }
};

const getSeverityIcon = (action: AuditAction) => {
  switch (action) {
    case "POLICY_VIOLATION":
    case "SECURITY_ALERT":
      return AlertTriangle;
    case "DELETE_DOCUMENT":
    case "REVOKE_ACCESS":
      return XCircle;
    case "SIGN_DOCUMENT":
    case "GRANT_ACCESS":
      return CheckCircle;
    default:
      return Info;
  }
};

export default function AuditLogPage() {
  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = React.useState<AuditEvent[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState<string>("all");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadAuditData();
  }, []);

  React.useEffect(() => {
    let filtered = [...events];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(event => 
        event.action.toLowerCase().includes(query) ||
        event.actorDid?.toLowerCase().includes(query)
      );
    }

    if (actionFilter !== "all") {
      filtered = filtered.filter(event => event.action === actionFilter);
    }

    setFilteredEvents(filtered);
  }, [events, searchQuery, actionFilter]);

  const loadAuditData = async () => {
    try {
      const auditEvents = await getAllAuditEvents();
      setEvents(auditEvents);
      setFilteredEvents(auditEvents);
    } catch (error) {
      console.error("Failed to load audit data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportJSONL = async () => {
    try {
      const jsonl = await exportAuditLogJSONL(events);
      const blob = new Blob([jsonl], { type: "application/jsonl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  const handleExportCSV = async () => {
    try {
      const csv = await exportAuditLogCSV(events);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  const handleComplianceReport = async () => {
    try {
      const report = await generateComplianceReport(
        events, 
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        new Date()
      );
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance-report-${format(new Date(), "yyyy-MM-dd")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Report generation failed:", error);
    }
  };

  const actionBreakdown = React.useMemo(() => {
    const breakdown: Record<string, number> = {};
    events.forEach(event => {
      breakdown[event.action] = (breakdown[event.action] || 0) + 1;
    });
    return breakdown;
  }, [events]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Hero Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
              <FileCheck className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                Audit Log
              </h1>
              <p className="text-muted-foreground mt-1">
                Immutable activity trail with Merkle tree verification
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{events.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Event Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {Object.keys(actionBreakdown).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Filtered Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{filteredEvents.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Search */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Action Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {Object.entries(actionTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="md:col-span-2 flex gap-2">
                <Button onClick={handleExportJSONL} variant="outline" size="sm" className="flex-1">
                  <Download className="h-4 w-4 mr-1" />
                  JSONL
                </Button>
                <Button onClick={handleExportCSV} variant="outline" size="sm" className="flex-1">
                  <Download className="h-4 w-4 mr-1" />
                  CSV
                </Button>
                <Button onClick={handleComplianceReport} variant="outline" size="sm" className="flex-1">
                  <FileCheck className="h-4 w-4 mr-1" />
                  Report
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Events Table */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Timeline</CardTitle>
            <CardDescription>
              Showing {filteredEvents.length} of {events.length} events
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading audit events...</div>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-12">
                <FileCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {events.length === 0 
                    ? "No audit events yet. Events will appear here as you use the app."
                    : "No events match your filters."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEvents.map((event) => {
                  const SeverityIcon = getSeverityIcon(event.action);
                  
                  return (
                    <div
                      key={event.id}
                      className="p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <SeverityIcon className="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold">
                                {actionTypeLabels[event.action] || event.action}
                              </span>
                              <Badge variant={getSeverityColor(event.action) as any}>
                                {event.action}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(event.ts), "PPp")}
                              </span>
                              {event.actorDid && (
                                <span className="font-mono truncate max-w-[200px]">
                                  {event.actorDid}
                                </span>
                              )}
                              {event.docHash && (
                                <span className="text-xs text-muted-foreground">
                                  Doc: {event.docHash.substring(0, 8)}...
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {event.sig && (
                          <Badge variant="outline" className="shrink-0">
                            <Shield className="h-3 w-3 mr-1" />
                            Signed
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
