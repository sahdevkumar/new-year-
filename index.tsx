import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";

// --- Configuration ---
const SUPABASE_URL = "https://pzlsgtmqmenefmusydcd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bHNndG1xbWVuZWZtdXN5ZGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTM4MjcsImV4cCI6MjA4Mjc2OTgyN30.lDZd8b5QIyHOmaOJkyh_y9gtoNcLILjbkFkZ_5kq2fY";
const STORAGE_BUCKET = "memories"; 
const SETTINGS_PASSWORD = "1234"; // Password to access settings

// --- Initialize Supabase Safely ---
const isSupabaseConfigured = SUPABASE_URL && SUPABASE_URL.startsWith("http");
const supabase = isSupabaseConfigured 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
  : null;

// --- Default Images ---
const DEFAULT_IMAGES = [
  "https://images.unsplash.com/photo-1516053308828-5690b21a329d?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1513205898869-79a029c78274?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1518199266791-5375a83190b7?q=80&w=1000&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?q=80&w=1000&auto=format&fit=crop",
];

// Default Romantic Music (Piano)
const DEFAULT_MUSIC = "https://cdn.pixabay.com/download/audio/2022/10/25/audio_1f242557b6.mp3?filename=piano-moment-111050.mp3";

// --- Helper: Image Compression ---
const compressImage = async (file: File): Promise<File> => {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= 300 * 1024) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;
      const MAX_DIM = 1600;
      if (width > height) {
        if (width > MAX_DIM) {
          height *= MAX_DIM / width;
          width = MAX_DIM;
        }
      } else {
        if (height > MAX_DIM) {
          width *= MAX_DIM / height;
          height = MAX_DIM;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          if (blob.size > 300 * 1024) {
             canvas.toBlob((blob2) => {
                if (blob2) {
                   const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                   resolve(new File([blob2], newName, { type: "image/jpeg", lastModified: Date.now() }));
                } else {
                   resolve(file);
                }
             }, "image/jpeg", 0.5);
          } else {
             const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
             resolve(new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() }));
          }
      }, "image/jpeg", 0.8);
    };
    img.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};

const App = () => {
  // --- Auth & Init State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [loginMobileInput, setLoginMobileInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [syncStatus, setSyncStatus] = useState("");

  // --- App State ---
  const displayYear = new Date().getFullYear() + 1;
  const [isSurpriseActive, setIsSurpriseActive] = useState(false);
  
  // Data State
  const [profileId, setProfileId] = useState<number | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [userName, setUserName] = useState("");
  const [userMobile, setUserMobile] = useState("");
  const [userProfilePic, setUserProfilePic] = useState("");
  const [musicUrl, setMusicUrl] = useState(DEFAULT_MUSIC);
  const [loveLetter, setLoveLetter] = useState("I am so lucky to have you in my life. Let's make this year our best one yet!");
  
  // UI State
  const [currentDisplayImage, setCurrentDisplayImage] = useState<string>("");
  const [customMessage, setCustomMessage] = useState(`Happy New Year ${displayYear}! 🎆`);
  const [showSqlGuide, setShowSqlGuide] = useState(false);
  const [copySuccess, setCopySuccess] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Settings & Security State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Upload State
  const [isUploadingMemories, setIsUploadingMemories] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState("");
  
  // --- Refs ---
  const memoriesInputRef = useRef<HTMLInputElement>(null);
  const profilePicInputRef = useRef<HTMLInputElement>(null);
  const sqlGuideRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- Logic: Auth & Data Fetching ---

  // 1. Check Local Storage on Mount
  useEffect(() => {
    const checkLogin = async () => {
        const cachedMobile = localStorage.getItem("app_user_mobile");
        if (cachedMobile) {
            setSyncStatus("Resuming session...");
            await fetchProfileByMobile(cachedMobile, true);
        } else {
            setIsCheckingAuth(false);
        }
    };
    checkLogin();
  }, []);

  const fetchProfileByMobile = async (mobile: string, isAutoLogin = false) => {
    if (!supabase) {
        if (!isAutoLogin) setLoginError("Database connection failed.");
        setIsCheckingAuth(false);
        return;
    }

    try {
        setSyncStatus("Fetching profile...");
        
        // A. Fetch Profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('mobile', mobile)
          .single();

        if (profileError || !profileData) {
            if (isAutoLogin) {
                // Cache invalid, clear it
                localStorage.removeItem("app_user_mobile");
            } else {
                setLoginError("Mobile number not found. Ask him to add you!");
            }
            setIsCheckingAuth(false);
            return;
        }

        // B. Set Data
        setProfileId(profileData.id);
        if (profileData.name) {
            setUserName(profileData.name);
            setCustomMessage(`Happy New Year ${displayYear}, ${profileData.name}! ❤️`);
        }
        if (profileData.profile_url) setUserProfilePic(profileData.profile_url);
        if (profileData.mobile) setUserMobile(profileData.mobile);
        if (profileData.music_url) setMusicUrl(profileData.music_url);
        if (profileData.love_letter) setLoveLetter(profileData.love_letter);

        // C. Fetch Images
        setSyncStatus("Syncing memories...");
        const { data: imagesData } = await supabase
            .from('images')
            .select('image_url')
            .eq('profile_id', profileData.id);

        let imageUrls: string[] = [];
        if (imagesData && imagesData.length > 0) {
            imageUrls = imagesData.map(img => img.image_url);
        } else {
            // Fallback for demo if no images uploaded yet
            imageUrls = DEFAULT_IMAGES; 
        }

        setUploadedImages(imageUrls);

        // D. Background Sync (Cache in LocalStorage & Preload)
        localStorage.setItem("app_user_mobile", mobile);
        localStorage.setItem("app_cached_images", JSON.stringify(imageUrls));
        
        // Preload images in background (Browser Cache)
        imageUrls.forEach(url => {
            const img = new Image();
            img.src = url;
        });

        setIsAuthenticated(true);
    } catch (err: any) {
        console.error("Login error", err);
        setLoginError(err?.message || "An unexpected error occurred.");
    } finally {
        setIsCheckingAuth(false);
        setSyncStatus("");
    }
  };

  const handleLoginSubmit = () => {
      if (!loginMobileInput.trim()) {
          setLoginError("Please enter your mobile number.");
          return;
      }
      setLoginError("");
      fetchProfileByMobile(loginMobileInput.trim());
  };

  // --- Logic: Slideshow ---

  useEffect(() => {
    if (isSurpriseActive) {
      if (audioRef.current) {
        audioRef.current.volume = 0.5;
        audioRef.current.play().then(() => setIsPlaying(true)).catch(e => console.log("Auto-play prevented", e));
      }

      const pool = uploadedImages.length > 0 ? uploadedImages : DEFAULT_IMAGES;
      
      if (!currentDisplayImage) {
        setCurrentDisplayImage(pool[Math.floor(Math.random() * pool.length)]);
      }

      const slideInterval = setInterval(() => {
        const poolRef = uploadedImages.length > 0 ? uploadedImages : DEFAULT_IMAGES;
        const randomIndex = Math.floor(Math.random() * poolRef.length);
        setCurrentDisplayImage(poolRef[randomIndex]);
      }, 4000);

      return () => clearInterval(slideInterval);
    }
  }, [isSurpriseActive, uploadedImages]);

  // --- Handlers ---

  const handleSettingsClick = () => {
    setIsPasswordModalOpen(true);
    setInputPassword("");
    setPasswordError("");
    setShowSqlGuide(false);
  };

  const verifyPassword = () => {
    if (inputPassword === SETTINGS_PASSWORD) {
      setIsPasswordModalOpen(false);
      setIsSettingsOpen(true);
    } else {
      setPasswordError("Incorrect Password");
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlCode).then(() => {
        setCopySuccess("Copied!");
        setTimeout(() => setCopySuccess(""), 2000);
    }, () => {
        setCopySuccess("Error copying");
    });
  };

  const handleRlsError = (message?: string) => {
    setStatusMsg(message || "⚠️ Database Error! See guide below.");
    setShowSqlGuide(true);
    setTimeout(() => {
        if (sqlGuideRef.current) {
            sqlGuideRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, 100);
  };

  const handleSaveProfile = async () => {
    if (!supabase) {
      setStatusMsg("Supabase not configured.");
      return;
    }
    
    setIsSavingProfile(true);
    setStatusMsg("Preparing profile...");

    try {
      let finalProfileUrl = userProfilePic;

      // 1. Upload Profile Picture
      if (profilePicInputRef.current?.files?.length) {
        let file = profilePicInputRef.current.files[0];
        setStatusMsg("Compressing avatar...");
        try { file = await compressImage(file); } catch (e) {}
        
        setStatusMsg("Uploading avatar...");
        const fileExt = file.name.split('.').pop();
        const fileName = `profiles/avatar_${Date.now()}.${fileExt}`;

        const { error: uploadErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(fileName, file, { upsert: true });

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(fileName);
        
        finalProfileUrl = urlData.publicUrl;
        setUserProfilePic(finalProfileUrl);
      }

      // 2. Insert into 'profiles' table
      setStatusMsg("Saving details...");
      const { data: newProfile, error } = await supabase.from('profiles').insert({
        name: userName,
        mobile: userMobile,
        profile_url: finalProfileUrl,
        music_url: musicUrl,
        love_letter: loveLetter
      }).select().single();

      if (error) throw error;
      
      if (newProfile) {
          setProfileId(newProfile.id);
      }
      
      setStatusMsg("Profile saved! You can now add memories.");
      setCustomMessage(`Happy New Year ${displayYear}, ${userName}! ❤️`);
      
      if (profilePicInputRef.current) profilePicInputRef.current.value = "";
      setTimeout(() => setStatusMsg(null), 3000);

    } catch (e: any) {
      console.error(e);
      // Defensive string check to prevent [object Object] rendering
      const errMsg = e?.message || "Unknown error";
      const errCode = e?.code || "";
      
      if (
          errMsg.includes("row-level security") || 
          errMsg.includes("column") || // Catch "Could not find the ... column" error
          errCode === "42501" || 
          errCode === "PGRST204"
      ) {
         handleRlsError("⚠️ Database schema update required. Run SQL below.");
      } else {
         setStatusMsg(`Error: ${typeof errMsg === 'string' ? errMsg : 'Check console for details'}`);
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleMemoriesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setStatusMsg(null);
    setUploadProgress("");
    
    if (!e.target.files || e.target.files.length === 0) return;

    if (!supabase) {
        setStatusMsg("Supabase not configured. Showing local preview.");
        const newImages: string[] = [];
        Array.from(e.target.files).forEach((file: File) => {
          newImages.push(URL.createObjectURL(file));
        });
        setUploadedImages((prev) => [...prev, ...newImages]);
        return;
    }

    if (!profileId) {
        setStatusMsg("⚠️ Please save 'Friend's Profile' (Step 1) first to link memories!");
        if (memoriesInputRef.current) memoriesInputRef.current.value = "";
        return;
    }

    setIsUploadingMemories(true);
    const files = Array.from(e.target.files) as File[];
    let successCount = 0;
    const total = files.length;
    let rlsErrorOccurred = false;

    for (let i = 0; i < total; i++) {
      if (rlsErrorOccurred) break;
      let file = files[i];
      setUploadProgress(`Compressing ${i + 1}/${total}...`);
      try { file = await compressImage(file); } catch (e) {}
      
      setUploadProgress(`Uploading ${i + 1}/${total}...`);
      const fileExt = file.name.split('.').pop();
      const publicId = `memories/img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fileName = `${publicId}.${fileExt}`;

      try {
        const { error: uploadErr } = await supabase.storage.from(STORAGE_BUCKET).upload(fileName, file);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
        const { error: dbError } = await supabase.from('images').insert({
             public_id: publicId,
             image_url: urlData.publicUrl,
             profile_id: profileId
          });
        if (dbError) throw dbError;
        setUploadedImages((prev) => [...prev, urlData.publicUrl]);
        successCount++;
      } catch (error: any) {
        console.error(`Error uploading file ${i + 1}:`, error);
        
        const errMsg = error?.message || "";
        const errCode = error?.code || "";

        if (errMsg.includes("row-level security") || errCode === "42501") {
            rlsErrorOccurred = true;
            handleRlsError();
        } else if (errCode === "PGRST204" || errMsg.includes("column")) { 
             rlsErrorOccurred = true;
             handleRlsError("⚠️ Database schema update required. Run SQL below.");
        }
      }
    }
    
    setIsUploadingMemories(false);
    setUploadProgress("");
    if (!rlsErrorOccurred) setStatusMsg(`Done! Uploaded ${successCount} of ${total} memories.`);
    if (memoriesInputRef.current) memoriesInputRef.current.value = "";
  };

  const triggerTestSurprise = () => {
    setIsSurpriseActive(true);
    setIsSettingsOpen(false);
  };

  const resetApp = () => {
    setIsSurpriseActive(false);
    setCurrentDisplayImage("");
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  };

  const toggleMusic = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const logout = () => {
      localStorage.removeItem("app_user_mobile");
      localStorage.removeItem("app_cached_images");
      setIsAuthenticated(false);
      setLoginMobileInput("");
      setUploadedImages([]);
  };

  // --- Styles ---
  const styles = {
    container: {
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
      color: "white",
      position: "relative" as const,
      overflow: "hidden",
    },
    overlay: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      pointerEvents: "none" as const,
      zIndex: 1,
    },
    glassCard: {
      background: "rgba(255, 255, 255, 0.1)",
      backdropFilter: "blur(12px)",
      borderRadius: "24px",
      padding: "2rem",
      border: "1px solid rgba(255, 255, 255, 0.15)",
      boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
      maxWidth: "90%",
      width: "600px",
      textAlign: "center" as const,
      zIndex: 10,
      position: "relative" as const,
    },
    loginCard: {
      background: "rgba(15, 23, 42, 0.6)",
      backdropFilter: "blur(16px)",
      borderRadius: "24px",
      padding: "3rem 2rem",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
      width: "90%",
      maxWidth: "400px",
      textAlign: "center" as const,
      zIndex: 10,
    },
    heading: {
      fontFamily: "'Parisienne', cursive",
      fontSize: "3rem",
      marginBottom: "0.5rem",
      color: "#ffd700",
      textShadow: "0 0 10px rgba(255, 215, 0, 0.5)",
    },
    timerGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "1rem",
      marginTop: "2rem",
    },
    timeBox: {
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      background: "rgba(0,0,0,0.2)",
      padding: "1rem 0.5rem",
      borderRadius: "12px",
    },
    timeNumber: {
      fontSize: "2.5rem",
      fontWeight: "700",
      fontFamily: "'Inter', sans-serif",
      lineHeight: 1,
    },
    timeLabel: {
      fontSize: "0.75rem",
      textTransform: "uppercase" as const,
      opacity: 0.8,
      marginTop: "0.5rem",
      letterSpacing: "1px",
    },
    settingsBtn: {
      position: "absolute" as const,
      bottom: "20px",
      right: "20px",
      background: "rgba(255,255,255,0.1)",
      border: "none",
      color: "white",
      padding: "10px",
      borderRadius: "50%",
      cursor: "pointer",
      zIndex: 50,
      fontSize: "1.2rem",
      transition: "background 0.3s",
    },
    musicBtn: {
        position: "fixed" as const,
        top: "20px",
        right: "20px",
        background: "rgba(255, 255, 255, 0.2)",
        border: "1px solid rgba(255,255,255,0.3)",
        color: "white",
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        cursor: "pointer",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)"
    },
    modal: {
      position: "fixed" as const,
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      background: "rgba(0,0,0,0.8)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100,
    },
    modalContent: {
      background: "#1e1b4b",
      padding: "2rem",
      borderRadius: "16px",
      width: "90%",
      maxWidth: "400px",
      border: "1px solid rgba(255,255,255,0.1)",
      maxHeight: "90vh",
      overflowY: "auto" as const,
    },
    input: {
      width: "100%",
      padding: "12px",
      marginTop: "5px",
      marginBottom: "15px",
      borderRadius: "8px",
      border: "1px solid #4c1d95",
      background: "#0f172a",
      color: "white",
      boxSizing: "border-box" as const,
      fontSize: "1rem"
    },
    textarea: {
        width: "100%",
        padding: "12px",
        marginTop: "5px",
        marginBottom: "15px",
        borderRadius: "8px",
        border: "1px solid #4c1d95",
        background: "#0f172a",
        color: "white",
        boxSizing: "border-box" as const,
        minHeight: "80px",
        fontFamily: "inherit"
    },
    btn: {
      background: "linear-gradient(45deg, #f50057, #ff4081)",
      color: "white",
      border: "none",
      padding: "12px 20px",
      borderRadius: "8px",
      cursor: "pointer",
      width: "100%",
      fontSize: "1rem",
      fontWeight: "600",
      marginTop: "10px",
    },
    avatar: {
      width: "80px",
      height: "80px",
      borderRadius: "50%",
      border: "3px solid #ffd700",
      objectFit: "cover" as const,
      margin: "0 auto 1rem auto",
      display: "block",
      boxShadow: "0 0 20px rgba(255, 215, 0, 0.4)"
    },
    surpriseContainer: {
      position: "fixed" as const,
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      zIndex: 60,
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      justifyContent: "center",
      background: "black",
      overflow: "hidden",
      cursor: "pointer"
    },
    bgImage: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      objectFit: "contain" as const,
      opacity: 0.4,
      background: "#000",
      animation: "zoomPan 20s infinite alternate",
    },
    messageOverlay: {
      zIndex: 70,
      textAlign: "center" as const,
      padding: "20px",
      width: "100%",
      maxWidth: "800px"
    },
    loveLetter: {
        fontSize: "1.5rem",
        color: "#ffd700",
        fontFamily: "'Inter', sans-serif",
        fontWeight: 300,
        textShadow: "0 2px 4px rgba(0,0,0,0.8)",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap" as const,
        minHeight: "3em"
    },
    sectionTitle: {
      fontSize: "1rem", 
      color: "#ff4081", 
      marginBottom: "15px", 
      borderBottom: '1px solid #333', 
      paddingBottom: '5px'
    },
    codeBlock: {
      background: '#0f172a',
      padding: '10px',
      borderRadius: '8px',
      fontSize: '0.75rem',
      fontFamily: 'monospace',
      overflowX: 'auto' as const,
      border: '1px solid #333',
      color: '#a5b4fc',
      marginBottom: '30px' 
    }
  };

  const sqlCode = `-- 1. Create Tables
create table if not exists profiles (
  id bigint generated by default as identity primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text,
  mobile text,
  profile_url text,
  music_url text,
  love_letter text
);

-- Ensure columns exist (Run this to update schema)
alter table profiles add column if not exists mobile text;
alter table profiles add column if not exists profile_url text;
alter table profiles add column if not exists name text;
alter table profiles add column if not exists music_url text;
alter table profiles add column if not exists love_letter text;

create table if not exists images (
  id bigint generated by default as identity primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  public_id text,
  image_url text
);

-- 2. Add Relation (Images -> Profile)
alter table images add column if not exists profile_id bigint references profiles(id) on delete cascade;

-- 3. Enable RLS
alter table profiles enable row level security;
alter table images enable row level security;

-- 4. Reset Policies (Fixes "already exists" error)
drop policy if exists "Public Profiles Access" on profiles;
drop policy if exists "Public Images Access" on images;
drop policy if exists "Public Storage Access" on storage.objects;

create policy "Public Profiles Access" on profiles for all using (true) with check (true);
create policy "Public Images Access" on images for all using (true) with check (true);

-- 5. Storage Policies
insert into storage.buckets (id, name, public) values ('memories', 'memories', true) on conflict (id) do nothing;
create policy "Public Storage Access" on storage.objects for all using ( bucket_id = 'memories' ) with check ( bucket_id = 'memories' );

-- 6. Link orphan images (Optional)
do $$
begin
  if exists (select 1 from profiles) then
    update images set profile_id = (select id from profiles order by id desc limit 1) where profile_id is null;
  end if;
end $$;`;

  // --- Components ---

  const FloatingParticles = () => (
    <div style={styles.overlay}>
      <style>{`
        @keyframes float {
          0% { transform: translateY(100vh) scale(0); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateY(-100px) scale(1); opacity: 0; }
        }
        .particle {
          position: absolute;
          bottom: -20px;
          background: white;
          border-radius: 50%;
          opacity: 0;
          animation: float 10s infinite linear;
        }
      `}</style>
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="particle"
          style={{
            width: Math.random() * 5 + 2 + "px",
            height: Math.random() * 5 + 2 + "px",
            left: Math.random() * 100 + "%",
            animationDelay: Math.random() * 5 + "s",
            animationDuration: Math.random() * 10 + 10 + "s",
            background: Math.random() > 0.5 ? "#ffd700" : "#ff69b4",
            boxShadow: "0 0 10px rgba(255,255,255,0.5)"
          }}
        />
      ))}
    </div>
  );

  const SurpriseView = () => {
    const [blasts, setBlasts] = useState<Array<{id: number, src: string, x: number, y: number, rot: number}>>([]);
    const [fireworks, setFireworks] = useState<Array<{id: number, x: number, y: number, color: string}>>([]);
    const [clickHearts, setClickHearts] = useState<Array<{id: number, x: number, y: number}>>([]);
    const [typedText, setTypedText] = useState("");
    const pool = uploadedImages.length > 0 ? uploadedImages : DEFAULT_IMAGES;

    // Typewriter Effect
    useEffect(() => {
        let index = 0;
        setTypedText("");
        const typingInterval = setInterval(() => {
            if (index < loveLetter.length) {
                setTypedText((prev) => prev + loveLetter.charAt(index));
                index++;
            } else {
                clearInterval(typingInterval);
            }
        }, 80); 
        return () => clearInterval(typingInterval);
    }, []);

    // Interactive Click
    const handleClick = (e: React.MouseEvent) => {
        const id = Date.now();
        const x = e.clientX;
        const y = e.clientY;
        setClickHearts(prev => [...prev, {id, x, y}]);
        setTimeout(() => {
             setClickHearts(prev => prev.filter(h => h.id !== id));
        }, 1000);
    };

    useEffect(() => {
       // Interval for Image Blasts
       const imageInterval = setInterval(() => {
          const id = Date.now();
          const src = pool[Math.floor(Math.random() * pool.length)];
          const x = Math.random() * 80; 
          const y = Math.random() * 60 + 10;
          const rot = (Math.random() - 0.5) * 40; 
          setBlasts(prev => [...prev, { id, src, x: x + 5, y, rot }]);
          setTimeout(() => setBlasts(prev => prev.filter(b => b.id !== id)), 3500);
       }, 1500); 

       // Interval for Fireworks
       const fireworkInterval = setInterval(() => {
           const id = Date.now() + Math.random();
           const x = Math.random() * 100;
           const y = Math.random() * 100;
           const colors = ['#f50057', '#00ff00', '#2979ff', '#ffd700', '#d500f9', '#00e5ff'];
           const color = colors[Math.floor(Math.random() * colors.length)];
           setFireworks(prev => [...prev, {id, x, y, color}]);
           setTimeout(() => setFireworks(prev => prev.filter(f => f.id !== id)), 1000);
       }, 800);

       return () => {
          clearInterval(imageInterval);
          clearInterval(fireworkInterval);
       }
    }, [pool]);

    return (
       <div style={styles.surpriseContainer} onClick={handleClick}>
          <style>{`
             @keyframes blastIn {
                0% { transform: scale(0) rotate(0deg); opacity: 0; }
                40% { transform: scale(1.1) rotate(var(--rot)); opacity: 1; }
                60% { transform: scale(0.95) rotate(var(--rot)); opacity: 1; }
                100% { transform: scale(1) rotate(var(--rot)); opacity: 1; }
             }
             @keyframes fadeOut {
                0% { opacity: 1; }
                100% { opacity: 0; }
             }
             @keyframes boom {
                0% { transform: scale(0); opacity: 0.8; }
                100% { transform: scale(4); opacity: 0; }
             }
             @keyframes floatUp {
                0% { transform: translateY(0) scale(1); opacity: 1; }
                100% { transform: translateY(-100px) scale(1.5); opacity: 0; }
             }
             @keyframes cursor {
                50% { border-color: transparent; }
             }
             @keyframes neonGlow {
                0% { text-shadow: 0 0 10px #fff, 0 0 20px #e60073; color: #fff; }
                50% { text-shadow: 0 0 20px #fff, 0 0 40px #ff4da6; color: #ffe6f2; }
                100% { text-shadow: 0 0 10px #fff, 0 0 20px #e60073; color: #fff; }
             }
             .animated-title {
                font-family: 'Parisienne', cursive;
                font-size: 5rem;
                margin-bottom: 20px;
                animation: neonGlow 1.5s ease-in-out infinite alternate;
                text-align: center;
                line-height: 1.2;
             }
             .blast-img {
                position: absolute;
                max-width: 300px;
                max-height: 300px;
                width: auto;
                height: auto;
                object-fit: contain;
                border: 4px solid white;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.6);
                animation: blastIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards, fadeOut 0.5s ease-in 3s forwards;
                z-index: 65;
                pointer-events: none;
             }
             .firework {
                position: absolute;
                width: 150px;
                height: 150px;
                border-radius: 50%;
                z-index: 60;
                animation: boom 0.8s ease-out forwards;
                mix-blend-mode: screen;
                pointer-events: none;
             }
             .click-heart {
                position: absolute;
                font-size: 2rem;
                color: #ff4081;
                pointer-events: none;
                z-index: 80;
                animation: floatUp 1s ease-out forwards;
             }
             .typewriter-cursor {
                border-right: 2px solid #ffd700;
                animation: cursor 0.75s step-end infinite;
             }
             @media (max-width: 600px) {
               .animated-title { font-size: 2.5rem !important; }
               .blast-img { max-width: 200px; max-height: 200px; }
               .firework { width: 100px; height: 100px; }
               .love-letter { font-size: 1rem !important; }
             }
          `}</style>
          {currentDisplayImage && (
            <img src={currentDisplayImage} style={{...styles.bgImage, opacity: 0.25}} />
          )}
          {fireworks.map(fw => (
             <div key={fw.id} className="firework" style={{
                left: fw.x + '%',
                top: fw.y + '%',
                background: `radial-gradient(circle, ${fw.color} 0%, transparent 70%)`
             }}/>
          ))}
          {clickHearts.map(h => (
              <div key={h.id} className="click-heart" style={{ left: h.x, top: h.y }}>❤️</div>
          ))}
          {blasts.map(b => (
             <img key={b.id} src={b.src} className="blast-img" style={{
                   left: b.x + '%', top: b.y + '%',
                   ['--rot' as any]: b.rot + 'deg', transform: `rotate(${b.rot}deg)` 
                }}
             />
          ))}
          <div style={styles.messageOverlay}>
            <h1 className="animated-title">{customMessage}</h1>
            <div style={styles.loveLetter} className="love-letter">
                {typedText}<span className="typewriter-cursor">&nbsp;</span>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); resetApp(); }}
              style={{...styles.btn, background: "rgba(255,255,255,0.2)", width: "auto", marginTop: "3rem", position:'relative', zIndex: 90}}
            >
              <i className="fas fa-undo"></i> Back
            </button>
          </div>
       </div>
    );
 };

  return (
    <div style={styles.container}>
      {/* Background Audio */}
      <audio ref={audioRef} src={musicUrl} loop />
      <FloatingParticles />

      {/* --- RENDER LOGIC --- */}
      
      {isCheckingAuth ? (
          <div style={{...styles.glassCard, textAlign: 'center'}} className="glass-card">
              <h2 style={{color: '#ffd700'}}>Loading...</h2>
              <p>{syncStatus}</p>
          </div>
      ) : !isAuthenticated ? (
          /* --- LOGIN SCREEN --- */
          <div style={styles.loginCard} className="login-card">
              <h1 style={{...styles.heading, fontSize: '2.5rem', marginBottom: '2rem'}} className="main-heading">Welcome</h1>
              <p style={{marginBottom: '20px', opacity: 0.9}}>Enter your mobile number to see your surprise.</p>
              
              <input 
                type="tel" 
                placeholder="Mobile Number" 
                value={loginMobileInput}
                onChange={(e) => setLoginMobileInput(e.target.value)}
                style={styles.input}
              />
              
              {loginError && (
                  <p style={{color: '#ff4081', fontSize: '0.9rem', marginTop: '5px'}}>{loginError}</p>
              )}
              
              <button onClick={handleLoginSubmit} style={{...styles.btn, marginTop: '20px'}}>
                  Enter
              </button>
              
              {/* Admin Button on Login Screen */}
              <button 
                onClick={handleSettingsClick}
                style={{
                    marginTop: '20px', 
                    background: 'transparent', 
                    border: 'none', 
                    color: '#4c1d95', 
                    fontSize: '0.8rem', 
                    cursor: 'pointer',
                    textDecoration: 'underline'
                }}
              >
                 Create New Surprise (Admin)
              </button>
          </div>
      ) : (
          /* --- MAIN COUNTDOWN APP --- */
          <>
            {/* Music Toggle */}
            {isSurpriseActive && (
                <button style={styles.musicBtn} onClick={toggleMusic}>
                    {isPlaying ? <i className="fas fa-volume-up"></i> : <i className="fas fa-volume-mute"></i>}
                </button>
            )}

            {/* Main Card */}
            <div style={styles.glassCard} className="glass-card">
                {userProfilePic && (
                <img src={userProfilePic} alt={userName} style={styles.avatar} className="avatar" />
                )}
                <h1 style={styles.heading} className="main-heading">A Special Surprise</h1>
                <p style={{ opacity: 0.8, fontStyle: "italic", marginBottom: "2rem" }}>
                {userName ? `I have something special for you, ${userName}...` : "I have something special for you..."}
                </p>
                
                <button 
                  onClick={() => setIsSurpriseActive(true)}
                  style={{...styles.btn, fontSize: '1.2rem', padding: '15px 30px', animation: 'pulse 2s infinite'}}
                >
                  Tap to Reveal ❤️
                </button>

                <style>{`
                  @keyframes pulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245, 0, 87, 0.7); }
                    70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(245, 0, 87, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245, 0, 87, 0); }
                  }
                `}</style>

                <div style={{marginTop: '20px'}}>
                  <button 
                      onClick={logout} 
                      style={{
                          background: 'transparent', 
                          border: '1px solid rgba(255,255,255,0.3)', 
                          padding: '5px 10px', 
                          borderRadius: '4px',
                          color: 'rgba(255,255,255,0.5)',
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                      }}
                  >
                      Logout
                  </button>
                </div>
            </div>

            {/* Settings Button */}
            <button style={styles.settingsBtn} onClick={handleSettingsClick} className="settings-btn">
                <i className="fas fa-cog"></i>
            </button>
          </>
      )}

      {/* --- MODALS (Settings & Password) --- */}
      
      {isPasswordModalOpen && (
        <div style={styles.modal}>
          <div style={{...styles.modalContent, textAlign: 'center', maxWidth: '300px'}}>
             <h3 style={{color: '#ffd700', marginTop: 0}}>Admin Access</h3>
             <p style={{fontSize: '0.9rem', opacity: 0.8}}>Please enter password to edit.</p>
             <input 
               type="password" 
               style={styles.input} 
               value={inputPassword}
               onChange={(e) => setInputPassword(e.target.value)}
               placeholder="Password"
             />
             {passwordError && <p style={{color: '#ff4081', fontSize: '0.8rem'}}>{passwordError}</p>}
             <button style={styles.btn} onClick={verifyPassword}>Unlock</button>
             <button 
               style={{...styles.btn, background: 'transparent', marginTop: '10px'}} 
               onClick={() => setIsPasswordModalOpen(false)}
             >
               Cancel
             </button>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
               <h3 style={{margin: 0, color: '#ffd700'}}>Setup Surprise</h3>
               <button onClick={() => setIsSettingsOpen(false)} style={{background:'none', border:'none', color:'white', fontSize:'1.2rem', cursor:'pointer'}}>&times;</button>
            </div>

            {/* SQL Guide Toggle */}
            <div style={{textAlign: 'right', marginBottom: '10px'}}>
              <button 
                onClick={() => setShowSqlGuide(!showSqlGuide)}
                style={{fontSize: '0.7rem', background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', textDecoration: 'underline'}}
              >
                {showSqlGuide ? "Hide Database Schema" : "Show Database Schema (Run in Supabase)"}
              </button>
            </div>

            {showSqlGuide && (
              <div style={styles.codeBlock} ref={sqlGuideRef}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                    <strong>Run this in Supabase SQL Editor:</strong>
                    <button 
                        onClick={handleCopySql}
                        style={{
                            background: '#4ade80', 
                            color: '#064e3b', 
                            border: 'none', 
                            padding: '4px 8px', 
                            borderRadius: '4px', 
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                        }}
                    >
                        {copySuccess || "Copy SQL"}
                    </button>
                </div>
                <pre style={{margin: '0', whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>
                    {sqlCode}
                </pre>
              </div>
            )}
            
            <div style={{marginBottom: '25px'}}>
              <h4 style={styles.sectionTitle}>1. Profile & Details</h4>
              
              <label style={{display: 'block', fontSize:'0.8rem', marginBottom:'5px'}}>Friend's Name</label>
              <input style={styles.input} value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="e.g. Sarah" />
              
              <label style={{display: 'block', fontSize:'0.8rem', marginBottom:'5px'}}>Mobile Number (Login ID)</label>
              <input style={styles.input} value={userMobile} onChange={(e) => setUserMobile(e.target.value)} placeholder="+1 234 567 8900" />

              <label style={{display: 'block', fontSize:'0.8rem', marginBottom:'5px'}}>Love Letter Message</label>
              <textarea 
                 style={styles.textarea} 
                 value={loveLetter} 
                 onChange={(e) => setLoveLetter(e.target.value)}
                 placeholder="Write a long, sweet message..." 
              />
              
              <label style={{display: 'block', fontSize:'0.8rem', marginBottom:'5px'}}>Music URL (MP3)</label>
              <input 
                 style={styles.input} 
                 value={musicUrl} 
                 onChange={(e) => setMusicUrl(e.target.value)} 
                 placeholder="https://...song.mp3" 
              />
              
              <label style={{display: 'block', fontSize:'0.8rem', marginBottom:'5px'}}>Profile Picture (Upload)</label>
              <input type="file" accept="image/*" style={styles.input} ref={profilePicInputRef} />
              
              <button 
                style={{...styles.btn, background: isSavingProfile ? '#555' : '#4c1d95', marginBottom: '5px'}} 
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
              >
                 {isSavingProfile ? "Saving..." : "Save Profile Details"}
              </button>
            </div>

            <div style={{marginBottom: '20px', paddingTop: '10px'}}>
               <h4 style={styles.sectionTitle}>2. Bulk Memories (50-100+)</h4>
               <label style={{display: 'block', fontSize:'0.8rem', marginBottom:'5px'}}>Select Multiple Photos</label>
               <input 
                 type="file" 
                 multiple 
                 accept="image/*"
                 style={styles.input}
                 ref={memoriesInputRef}
                 onChange={handleMemoriesUpload}
                 disabled={isUploadingMemories}
               />
               
               {isUploadingMemories && (
                 <div style={{textAlign: 'center', margin: '10px 0'}}>
                   <p style={{color: '#ffd700', fontSize: '0.9rem', marginBottom: '5px'}}>
                     {uploadProgress}
                   </p>
                   <div style={{width: '100%', height: '4px', background: '#333', borderRadius: '2px'}}>
                      <div style={{width: '100%', height: '100%', background: '#ffd700', animation: 'pulse 1s infinite'}}/>
                   </div>
                 </div>
               )}

               {statusMsg && (
                 <p style={{
                   color: statusMsg.includes("Error") || statusMsg.includes("⚠️") ? '#ff4081' : '#4ade80', 
                   fontSize: '0.9rem', textAlign: 'center',
                   fontWeight: statusMsg.includes("⚠️") ? 'bold' : 'normal'
                 }}>
                   {statusMsg}
                 </p>
               )}
               
               {!isUploadingMemories && uploadedImages.length > 0 && (
                 <p style={{fontSize: '0.8rem', color: '#a5b4fc', marginTop: '5px', textAlign: 'center'}}>
                   Total {uploadedImages.length} memories loaded.
                 </p>
               )}
            </div>
            
            <button style={styles.btn} onClick={() => setIsSettingsOpen(false)}>
              Close
            </button>
            
            <div style={{marginTop: '15px', textAlign: 'center'}}>
               <button 
                 style={{...styles.btn, background: 'transparent', border: '1px solid #f50057', fontSize: '0.9rem'}}
                 onClick={triggerTestSurprise}
               >
                 Test Surprise Now
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Surprise Overlay */}
      {isSurpriseActive && <SurpriseView />}

      {/* Mobile Responsive adjustments */}
      <style>{`
        * { box-sizing: border-box; }
        @media (max-width: 600px) {
          .glass-card {
             padding: 1.5rem 1rem !important;
             width: 90% !important;
             min-width: unset !important;
          }
          .login-card {
             width: 90% !important;
             padding: 2rem 1.5rem !important;
          }
          .main-heading {
             font-size: 2rem !important;
             margin-bottom: 0.5rem !important;
          }
          .timer-grid {
             gap: 0.5rem !important;
             margin-top: 1.5rem !important;
          }
          .time-box {
             padding: 0.8rem 0.2rem !important;
          }
          .time-number {
             font-size: 1.5rem !important;
          }
          .time-label {
             font-size: 0.6rem !important;
          }
          .avatar {
             width: 60px !important;
             height: 60px !important;
             margin-bottom: 0.5rem !important;
          }
          .settings-btn {
             bottom: 15px !important;
             right: 15px !important;
             padding: 8px !important;
             font-size: 1rem !important;
          }
        }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);