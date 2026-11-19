"use client";

import { useActionState, useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { Button, Field, FormError, Input, Select, Textarea } from "./ui";

type State = { error?: string } | undefined;

export function ReportForm({
  action,
  lastProgress,
}: {
  action: (s: State, f: FormData) => Promise<State>;
  lastProgress: number;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [progress, setProgress] = useState(lastProgress);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { timeout: 5000 },
    );
  }, []);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date">
          <Input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
        </Field>
        <Field label="Weather">
          <Select name="weather" defaultValue="Sunny">
            {["Sunny", "Cloudy", "Light rain", "Heavy rain", "Windy", "Hot", "Cold"].map((w) => (
              <option key={w}>{w}</option>
            ))}
          </Select>
        </Field>
        <Field label="Workers on site">
          <Input name="crewCount" type="number" min={0} defaultValue={12} required />
        </Field>
      </div>
      <Field label={`Overall progress: ${progress}%`} hint={`Last report said ${lastProgress}%.`}>
        <input
          name="progress"
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
          className="w-full accent-[#e8590c]"
        />
      </Field>
      <Field label="Work done today">
        <Textarea name="workDone" rows={4} placeholder="Poured level 2 slab, east side. Started blockwork on unit 3." required />
      </Field>
      <Field label="Issues or delays" hint="Anything the manager should know. Leave blank if none.">
        <Textarea name="issues" placeholder="Rebar delivery arrived short by 2 tonnes." />
      </Field>
      <Field label="Site photos" hint="Up to 12 photos. Taken on your phone? They upload straight from the camera.">
        <Input
          name="photos"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => setPreviews(Array.from(e.target.files ?? []).map((f) => URL.createObjectURL(f)))}
        />
      </Field>
      {previews.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {previews.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="aspect-square w-full rounded-md object-cover" />
          ))}
        </div>
      )}
      {coords && (
        <>
          <input type="hidden" name="lat" value={coords.lat} />
          <input type="hidden" name="lng" value={coords.lng} />
          <p className="flex items-center gap-1 text-xs text-muted">
            <MapPin className="h-3.5 w-3.5" /> Photos will be tagged with your location.
          </p>
        </>
      )}
      <FormError message={state?.error} />
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Uploading…" : "Submit report"}
      </Button>
    </form>
  );
}
