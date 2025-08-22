import React, { useEffect, useMemo, useState } from "react";

function TextField({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ color: "#9ba3af", fontWeight: 600, fontSize: 13 }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#fff",
          padding: "10px 12px",
          borderRadius: 10,
          outline: "none",
        }}
      />
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ color: "#9ba3af", fontWeight: 600, fontSize: 13 }}>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#fff",
          padding: "10px 12px",
          borderRadius: 10,
          outline: "none",
          resize: "vertical",
        }}
      />
    </label>
  );
}

export default function MoreInfo({ email, defaults = {} }) {
  const storageKey = useMemo(() => `profile.moreinfo:${email || "anon"}`, [email]);

  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [github, setGithub] = useState("");

  // Load from localStorage or defaults
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved) {
        setBio(saved.bio || "");
        setLocation(saved.location || "");
        setWebsite(saved.website || "");
        setTwitter(saved.twitter || "");
        setGithub(saved.github || "");
        return;
      }
    } catch {}
    setBio(defaults.bio || "Say something about yourself…");
    setLocation(defaults.location || "");
    setWebsite(defaults.website || "");
    setTwitter(defaults.twitter || "");
    setGithub(defaults.github || "");
  }, [storageKey, defaults]);

  // Save on change
  useEffect(() => {
    const payload = { bio, location, website, twitter, github };
    try { localStorage.setItem(storageKey, JSON.stringify(payload)); } catch {}
  }, [storageKey, bio, location, website, twitter, github]);

  return (
    <div
      style={{
        width: "min(980px, 92vw)",
        margin: "20px auto 40px",
        display: "grid",
        gap: 14,
        background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14,
        padding: 18,
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>More Info</div>
        <button
          onClick={() => setEditing((v) => !v)}
          style={{
            background: editing ? "#fff" : "rgba(255,255,255,0.08)",
            color: editing ? "#000" : "#fff",
            border: "1px solid rgba(255,255,255,0.18)",
            padding: "8px 12px",
            borderRadius: 10,
            fontWeight: 800,
          }}
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      {!editing ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ color: "#e5e5e5", lineHeight: 1.7 }}>{bio || "—"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {location && (
              <div style={itemBoxStyle}><span style={muted}>Location</span><span>{location}</span></div>
            )}
            {website && (
              <div style={itemBoxStyle}><span style={muted}>Website</span><a href={website} target="_blank" rel="noreferrer">{website}</a></div>
            )}
            {twitter && (
              <div style={itemBoxStyle}><span style={muted}>Twitter</span><a href={`https://twitter.com/${twitter.replace(/^@/, "")}`} target="_blank" rel="noreferrer">@{twitter.replace(/^@/, "")}</a></div>
            )}
            {github && (
              <div style={itemBoxStyle}><span style={muted}>GitHub</span><a href={`https://github.com/${github}`} target="_blank" rel="noreferrer">{github}</a></div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <TextArea label="Bio" value={bio} onChange={setBio} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <TextField label="Location" value={location} onChange={setLocation} placeholder="e.g. Pune, IN" />
            <TextField label="Website" value={website} onChange={setWebsite} placeholder="https://..." />
            <TextField label="Twitter" value={twitter} onChange={setTwitter} placeholder="@handle" />
            <TextField label="GitHub" value={github} onChange={setGithub} placeholder="username" />
          </div>
        </div>
      )}
    </div>
  );
}

const muted = { color: "#9ba3af", fontWeight: 700, fontSize: 12 };
const itemBoxStyle = {
  display: "grid",
  gap: 6,
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
};
