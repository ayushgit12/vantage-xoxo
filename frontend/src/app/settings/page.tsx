"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // TODO: POST to /api/users/profile and /api/constraints
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <form onSubmit={handleSave} className="space-y-6">
        <section>
          <h2 className="text-lg font-semibold mb-3">Profile</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Timezone</label>
              <select className="w-full border rounded-lg px-3 py-2" defaultValue="UTC">
                <option>UTC</option>
                <option>America/New_York</option>
                <option>America/Los_Angeles</option>
                <option>Europe/London</option>
                <option>Asia/Kolkata</option>
                <option>Asia/Tokyo</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Daily Capacity (hours)</label>
              <input type="number" defaultValue={8} min={1} max={16} step={0.5} className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Sleep Window</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Sleep Start</label>
              <input type="time" defaultValue="23:00" className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sleep End</label>
              <input type="time" defaultValue="07:00" className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Preferred Study Windows</h2>
          <p className="text-sm text-gray-500 mb-2">When do you prefer to study?</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Window Start</label>
              <input type="time" defaultValue="09:00" className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Window End</label>
              <input type="time" defaultValue="17:00" className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
        </section>

        {saved && <p className="text-green-600 text-sm">Settings saved!</p>}

        <button
          type="submit"
          className="w-full bg-brand-600 text-white py-2 rounded-lg hover:bg-brand-700"
        >
          Save Settings
        </button>
      </form>
    </div>
  );
}
