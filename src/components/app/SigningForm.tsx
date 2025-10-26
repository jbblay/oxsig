"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const schema = z.object({
  title: z.string().min(2, "Title is required"),
  sections: z.string().min(1, "Provide section IDs or descriptions"),
  duress: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function SigningForm() {
  const [submitted, setSubmitted] = React.useState<FormValues | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      sections: "",
      duress: false,
    },
  });

  const duress = watch("duress");

  const onSubmit = handleSubmit((values) => {
    setSubmitted(values);
    if (values.duress) {
      toast.warning("Duress mode: Decoy signature generated. Silent alert recorded.");
    } else {
      toast.success(`Signature prepared for "${values.title}"`);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Compose Smart Signature</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Document title</Label>
            <Input id="title" placeholder="e.g., NDA with Acme Corp" {...register("title")} />
            {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sections">Sections to sign or mask</Label>
            <Textarea id="sections" rows={4} placeholder="e.g., section-1, section-3; mask section-2" {...register("sections")} />
            {errors.sections ? <p className="text-xs text-destructive">{errors.sections.message}</p> : null}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Duress mode</Label>
              <p className="text-xs text-muted-foreground">Generate decoy signature and record silent alert.</p>
            </div>
            <Switch checked={duress} onCheckedChange={(checked) => setValue("duress", checked, { shouldDirty: true })} />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>Prepare Signature</Button>
            <Button type="button" variant="secondary" onClick={() => { setSubmitted(null); toast.info("Form cleared"); }}>
              Clear
            </Button>
          </div>
        </form>

        {submitted ? (
          <>
            <Separator />
            <div className="text-sm">
              <div className="font-medium mb-1">Preview</div>
              <pre className="text-xs overflow-auto max-h-[200px] rounded bg-muted p-3">
                {JSON.stringify({
                  docId: "example-doc",
                  title: submitted.title,
                  sections: submitted.sections.split(",").map((s) => s.trim()).filter(Boolean),
                  duress: submitted.duress,
                  context: {
                    timestamp: new Date().toISOString(),
                    geoHint: "lat:0,long:0",
                  },
                }, null, 2)}
              </pre>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}