import React from "react";
import ProfileCard from "./ProfileCard";
import MoreInfo from "./MoreInfo";
import { ChromeGrid } from "./components/ui/ChromeGrid";

function App() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get("name") || "User";
  const title = params.get("title") || "Reader";
  const handle = params.get("handle") || (name ? name.toLowerCase().replace(/\s+/g, "") : "user");
  const status = params.get("status") || "Online";
  const avatarUrl = params.get("avatar");
  const email = params.get("email");

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
        margin: 0,
        color: "#fff",
        overflow: "hidden",
      }}
    >
      {/* Background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
        }}
        aria-hidden
      >
        <ChromeGrid />
      </div>

      {/* Foreground content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          alignItems: "center",
          gap: 16,
          paddingTop: 24,
          paddingBottom: 40,
        }}
      >
        <ProfileCard
          name={name}
          title={title}
          handle={handle}
          status={status}
          contactText={email ? `Email ${name}` : "Contact Me"}
          avatarUrl={avatarUrl || "/avatar.png"}
          miniAvatarUrl={avatarUrl || "/avatar.png"}
          showUserInfo={true}
          enableTilt={true}
          enableMobileTilt={false}
          onContactClick={() => {
            if (email) {
              window.location.href = `mailto:${email}`;
            }
          }}
        />
        <MoreInfo
          email={email}
          defaults={{
            bio: "Welcome to my reading profile!",
            location: "",
            website: "",
            twitter: "",
            github: "",
          }}
        />
      </div>
    </div>
  );
}

export default App;
