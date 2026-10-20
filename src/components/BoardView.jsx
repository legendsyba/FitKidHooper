import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { isVideoAvailable } from "../lib/buddyVideo.js";
// Lazily loaded: the call surface pulls in the LiveKit SDK, which no one who
// never opens a session should have to download.
const BuddyVideoSheet = lazy(() => import("./BuddyVideoSheet.jsx"));
import {
  AGE_GROUPS,
  LEADERBOARD_PERIODS,
  getAgeGroup,
  getAgeGroupLabel,
} from "../lib/periodStats.js";
import {
  BOARD_TYPES,
  fetchAgeGroupBoard,
  fetchFriendsBoard,
  getBoardAthleteId,
  getLastPushTime,
  isLeaderboardConfigured,
  maybeAutoSyncLeaderboard,
  createFriendInvite,
  acceptFriendInvite,
  sendFriendRequestTo,
  searchAthletesForFriend,
  listFriendRequests,
  listSentFriendRequests,
  respondFriendRequest,
  listFriendAthleteIds,
  getInviteUrl,
} from "../lib/boardsApi.js";
import FeedView from "./FeedView.jsx";
import FriendAvatar from "./FriendAvatar.jsx";
import FriendProfileSheet from "./FriendProfileSheet.jsx";
import MessagesSheet, { MessagesPanel } from "./MessagesSheet.jsx";
import CountBadge from "./CountBadge.jsx";
import ChallengesActivePanel from "./ChallengesActivePanel.jsx";
import { fetchProfileSnippets, fetchUsernames, fetchFriendWeekStats, profileSnippet, pathRankLabel } from "../lib/friendProfileApi.js";
import { getAchievementMeta } from "../lib/achievements.js";

const SQUAD_TABS = [
  ["friends", "Squad"],
  ["messages", "Messages"],
  ["feed", "Feed"],
];

function friendOverviewLine(profile, stats) {
  const parts = [];
  const path = pathRankLabel(profile);
  if (path) parts.push(path);
  if (stats?.streak > 0) parts.push(`${stats.streak}-day streak`);
  else if (stats?.training_days > 0) parts.push(`${stats.training_days} training days this week`);
  if (stats?.play_like) parts.push(`plays like ${stats.play_like}`);
  return parts.join(" · ") || "On your squad";
}

function fmtRelativePush(ts) {
  if (!ts) return "Not synced yet";
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return "Synced today";
  if (days === 1) return "Synced yesterday";
  return `Synced ${days} days ago`;
}

function medalForRank(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return rank;
}

export default function BoardView({
  settings,
  completed,
  missionLog,
  getCategory,
  earnedBadges = [],
  ledger = {},
  personalChallenges = [],
  P,
  BG,
  SF,
  bd,
  lbl,
  onPushSuccess,
  onAddFriends,
  focusFriendsTick = 0,
  initialInviteCode,
  isSignedIn,
  onOpenAuth,
  modes = ["challenges", "friends", "rankings"],
  unreadMessages = 0,
  friendRequests = 0,
  feedActivity = 0,
  challengeActivity = 0,
  onSquadTabSeen,
  onUnreadRefresh,
  addOpen = false,
  onOpenAdd,
  openMessagesInbox = false,
  onMessagesInboxOpened,
}) {
  const myAgeGroup = getAgeGroup(settings.dateOfBirth);
  const friendsPanelRef = useRef(null);
  const isSquadLayout = modes.length === 1 && modes[0] === "friends";
  const [mode, setMode] = useState(modes[0]);
  const [squadTab, setSquadTab] = useState("friends");
  const [squadChallengesOpen, setSquadChallengesOpen] = useState(false);
  // Buddy video. `videoAvailable` is the server kill switch, asked once — it is
  // off by default and stays off until parent verification clears legal review,
  // so the button simply does not exist rather than existing and failing.
  const [videoAvailable, setVideoAvailable] = useState(false);
  const [videoFriend, setVideoFriend] = useState(null);
  const canVideo = isSignedIn && videoAvailable;
  const [messageFriend, setMessageFriend] = useState(null);
  const [boardType, setBoardType] = useState("age_group");
  const [ageGroup, setAgeGroup] = useState(myAgeGroup);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [period, setPeriod] = useState("week");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState(null);
  const [pushMsg, setPushMsg] = useState(null);
  const [athleteId, setAthleteId] = useState(null);
  const [inviteCode, setInviteCode] = useState(null);
  const [inviteInput, setInviteInput] = useState(initialInviteCode || "");
  const [friendMsg, setFriendMsg] = useState(null);
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requests, setRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [requesterProfiles, setRequesterProfiles] = useState({});
  const [friendProfileId, setFriendProfileId] = useState(null);
  const [friendRoster, setFriendRoster] = useState([]);
  const configured = isLeaderboardConfigured();

  const viewFriend = useCallback(id => {
    if (id) setFriendProfileId(id);
  }, []);

  useEffect(() => {
    getBoardAthleteId().then(setAthleteId);
  }, []);

  const loadRequests = useCallback(async () => {
    if (!isSignedIn) { setRequests([]); setRequesterProfiles({}); return; }
    const list = await listFriendRequests();
    setRequests(list);
    const ids = list.map(r => r.requester_id).filter(Boolean);
    if (ids.length) {
      const map = await fetchProfileSnippets(ids);
      setRequesterProfiles(map);
    } else {
      setRequesterProfiles({});
    }
  }, [isSignedIn]);

  const loadSentRequests = useCallback(async () => {
    if (!isSignedIn) { setSentRequests([]); return; }
    const list = await listSentFriendRequests();
    setSentRequests(list);
  }, [isSignedIn]);

  useEffect(() => { loadRequests(); loadSentRequests(); }, [loadRequests, loadSentRequests]);

  // Only ever set from the async answer. Signing out is handled by `canVideo`
  // below rather than by resetting here, which would be a synchronous setState
  // in an effect body and a cascading render.
  useEffect(() => {
    if (!isSignedIn) return undefined;
    let cancelled = false;
    isVideoAvailable().then(v => { if (!cancelled) setVideoAvailable(v); });
    return () => { cancelled = true; };
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSquadLayout || !onSquadTabSeen) return undefined;
    return () => {
      if (squadTab === "friends") { onSquadTabSeen("friends"); onSquadTabSeen("challenges"); }
      else if (squadTab === "feed") onSquadTabSeen("friends");
    };
  }, [isSquadLayout, squadTab, onSquadTabSeen]);

  useEffect(() => {
    if (!isSignedIn) {
      setSearchResults([]);
      setSelectedAthlete(null);
      return undefined;
    }
    const q = friendSearchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSelectedAthlete(null);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await searchAthletesForFriend(q);
        if (!alive) return;
        setSearchResults(results);
        setSelectedAthlete(prev => (
          prev && results.some(r => r.user_id === prev.user_id) ? prev : null
        ));
      } catch {
        if (alive) setSearchResults([]);
      } finally {
        if (alive) setSearchLoading(false);
      }
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [friendSearchQuery, isSignedIn]);

  useEffect(() => {
    if (mode !== "friends" || !athleteId || !configured) {
      setFriendRoster([]);
      return;
    }
    let alive = true;
    (async () => {
      const ids = (await listFriendAthleteIds(athleteId)).filter(id => id !== athleteId);
      if (!ids.length) { if (alive) setFriendRoster([]); return; }
      const [map, usernames, stats] = await Promise.all([
        fetchProfileSnippets(ids),
        fetchUsernames(ids),
        fetchFriendWeekStats(ids),
      ]);
      if (!alive) return;
      setFriendRoster(ids.map(id => ({
        profile: map[id] || profileSnippet({ id, display_name: "Friend" }),
        username: usernames[id] || null,
        stats: stats[id] || null,
      })));
    })();
    return () => { alive = false; };
  }, [mode, athleteId, configured, requests.length]);

  /* Act once per focus request. The tick never resets, so re-running on every render
     (or when the inbox flag clears) kept yanking kids back to Friends — out of Messages
     right after a "messages" deep link, and out of an open chat on any re-render. */
  const hasFriendsMode = modes.includes("friends");
  const handledFocusTickRef = useRef(0);
  useEffect(() => {
    if (!focusFriendsTick || !hasFriendsMode || handledFocusTickRef.current === focusFriendsTick) return;
    handledFocusTickRef.current = focusFriendsTick;
    setMode("friends");
    if (!openMessagesInbox) setSquadTab("friends");
    setTimeout(() => {
      friendsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, [focusFriendsTick, openMessagesInbox, hasFriendsMode]);

  useEffect(() => {
    if (!isSquadLayout || !openMessagesInbox) return;
    setSquadTab("messages");
  }, [openMessagesInbox, isSquadLayout]);

  useEffect(() => {
    if (mode !== "friends" || !isSignedIn) return;
    loadRequests();
    loadSentRequests();
  }, [focusFriendsTick, mode, isSignedIn, loadRequests, loadSentRequests]);

  useEffect(() => {
    if (!openMessagesInbox) return;
    if (modes.includes("friends")) setMode("friends");
    setSquadTab("messages");
    setMessageFriend(null);
    onMessagesInboxOpened?.();
  }, [openMessagesInbox, modes, onMessagesInboxOpened]);

  const openMessageWithFriend = useCallback(friend => {
    setSquadTab("messages");
    setMessageFriend(friend);
  }, []);

  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError(null);
    let result = { rows: [], error: null };

    if (boardType === "age_group") {
      result = await fetchAgeGroupBoard({ ageGroup, period });
    } else if (boardType === "friends" && athleteId) {
      const friendIds = await listFriendAthleteIds(athleteId);
      result = await fetchFriendsBoard({ athleteIds: friendIds, period });
    }

    if (result.error) setError(result.error);
    else if (result.rows?.length) {
      const map = await fetchProfileSnippets(result.rows.map(r => r.athlete_id));
      setRows(result.rows.map(r => ({
        ...r,
        profile: map[r.athlete_id] || profileSnippet({ id: r.athlete_id, display_name: r.display_name }),
      })));
    } else {
      setRows(result.rows || []);
    }
    setLoading(false);
  }, [boardType, ageGroup, period, configured, athleteId]);

  const syncAndLoad = useCallback(async (force = false) => {
    if (configured) {
      await maybeAutoSyncLeaderboard({
        settings, completed, missionLog, getCategory, earnedBadges, ledger, force,
      });
    }
    await load();
  }, [configured, settings, completed, missionLog, getCategory, earnedBadges, ledger, load]);

  useEffect(() => { syncAndLoad(); }, [syncAndLoad]);

  useEffect(() => {
    if (initialInviteCode && athleteId && modes.includes("friends")) {
      setInviteInput(initialInviteCode);
      setMode("friends");
    }
  }, [initialInviteCode, athleteId, modes]);

  const handleSyncNow = async () => {
    setPushing(true);
    setError(null);
    setPushMsg(null);
    try {
      const result = await maybeAutoSyncLeaderboard({
        settings, completed, missionLog, getCategory, earnedBadges, ledger, force: true,
      });
      if (!result.ok) throw new Error(result.error || "Sync failed");
      setPushMsg("Challenges synced.");
      onPushSuccess?.();
      await load();
    } catch (e) {
      setError(e.message || "Sync failed");
    } finally {
      setPushing(false);
    }
  };

  const handleCreateInvite = async () => {
    if (!athleteId) return;
    setFriendMsg(null);
    try {
      const { code } = await createFriendInvite(athleteId);
      setInviteCode(code);
      setFriendMsg(`Share code: ${code}`);
    } catch (e) {
      setFriendMsg(e.message || "Could not create invite");
    }
  };

  const handleAcceptInvite = async () => {
    if (!athleteId || !inviteInput.trim()) return;
    setFriendMsg(null);
    try {
      await acceptFriendInvite(inviteInput.trim(), athleteId);
      setFriendMsg("Friend added!");
      setInviteInput("");
      await load();
    } catch (e) {
      setFriendMsg(e.message || "Invalid code");
    }
  };

  const handleSendRequest = async () => {
    if (!selectedAthlete?.user_id) return;
    const { user_id: id, username: u, display_name: name } = selectedAthlete;
    setFriendMsg(null);
    setSendingRequest(true);
    try {
      const res = await sendFriendRequestTo(id);
      const label = u ? `@${u}` : (name || "them");
      if (res.status === "accepted") {
        setFriendMsg(`You're now friends with ${label}!`);
        await load();
      } else {
        setFriendMsg(`Request sent to ${label} — they'll need to accept.`);
      }
      setFriendSearchQuery("");
      setSearchResults([]);
      setSelectedAthlete(null);
      await loadSentRequests();
      onUnreadRefresh?.();
    } catch (e) {
      setFriendMsg(e.message || "Could not send request");
    } finally {
      setSendingRequest(false);
    }
  };

  const handleRespond = async (id, accept) => {
    setFriendMsg(null);
    try {
      await respondFriendRequest(id, accept);
      await loadRequests();
      onUnreadRefresh?.();
      if (accept) { setFriendMsg("Friend added!"); await load(); }
    } catch (e) {
      setFriendMsg(e.message || "Could not respond");
    }
  };

  const myRank = rows.findIndex(r => r.athlete_id === athleteId) + 1;
  const myRow = rows.find(r => r.athlete_id === athleteId);

  return (
    <div style={{ padding: isSquadLayout ? "0 20px 24px" : "0 20px 100px" }}>
      {modes.length > 1 && (
        <div style={{ display: "flex", gap: 6, margin: "14px 0 0" }}>
          {[["challenges", "🎯 Challenges"], ["friends", "👋 Friends"], ["rankings", "🏆 Rankings"]]
            .filter(([m]) => modes.includes(m))
            .map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: "9px 4px", borderRadius: 10, fontSize: 11, fontWeight: 800, cursor: "pointer",
              border: `1px solid ${mode === m ? P : bd}`,
              background: mode === m ? `${P}18` : "transparent",
              color: mode === m ? P : "#64748b",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}>
              <span>{label}</span>
              {m === "friends" && (unreadMessages + friendRequests + feedActivity + challengeActivity) > 0 && (
                <CountBadge count={unreadMessages + friendRequests + feedActivity + challengeActivity} P={P} />
              )}
            </button>
          ))}
        </div>
      )}

      {mode === "challenges" ? (
        <div style={{ marginTop: 12 }}>
          <ChallengesActivePanel
            personalChallenges={personalChallenges}
            P={P}
            SF={SF}
            bd={bd}
            onAddFriends={() => { onAddFriends?.(); setMode("friends"); }}
          />
        </div>
      ) : mode === "friends" ? (
        <div style={{ marginTop: isSquadLayout ? 0 : 12 }} ref={friendsPanelRef}>
          <div style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {SQUAD_TABS.map(([tab, label]) => {
              // Requests used to carry their own badge on their own tab; they
              // are an in-place banner on Squad now, so the count rides there.
              const badge = tab === "messages" ? unreadMessages
                : tab === "friends" ? (friendRequests || requests.length) + challengeActivity
                : tab === "feed" ? feedActivity
                : 0;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setSquadTab(tab);
                    if (tab === "friends") { onSquadTabSeen?.("friends"); onSquadTabSeen?.("challenges"); }
                    if (tab !== "messages") setMessageFriend(null);
                  }}
                  style={{
                    flex: "1 0 auto", minWidth: 0, padding: "9px 10px", borderRadius: 10,
                    fontSize: 10, fontWeight: 800, cursor: "pointer",
                    border: `1px solid ${squadTab === tab ? P : bd}`,
                    background: squadTab === tab ? `${P}18` : "transparent",
                    color: squadTab === tab ? P : "#64748b",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                  }}
                >
                  <span>{label}</span>
                  {badge > 0 && <CountBadge count={badge} P={P} />}
                </button>
              );
            })}
          </div>

          {/* 3.3 — one panel behind a permanently visible + Add, replacing a
              card that stacked four unrelated jobs on a fourth tab. */}
          {addOpen && (
            <div style={{ background: SF, border: `1px solid ${P}44`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
              {!isSignedIn && (
                <div style={{
                  marginBottom: 12, padding: "10px 12px", borderRadius: 10,
                  background: `${P}12`, border: `1px solid ${P}28`, fontSize: 11, color: "var(--fkh-text-muted)", lineHeight: 1.5,
                }}>
                  Sign in to add friends and keep your friend list across devices.
                  <button type="button" onClick={onOpenAuth} style={{
                    display: "block", marginTop: 8, padding: "8px 12px", borderRadius: 8, border: `1px solid ${P}44`,
                    background: "transparent", color: P, fontSize: 11, fontWeight: 700, cursor: "pointer", width: "100%",
                  }}>Sign in</button>
                </div>
              )}
              <div style={{ fontSize: 14, fontWeight: 800, color: P, marginBottom: 4 }}>Find a friend</div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, lineHeight: 1.45 }}>
                Search by first name, last name, or username — or share a friend code.
              </div>

              <div style={{ marginBottom: 10 }}>
                <input
                  value={friendSearchQuery}
                  onChange={e => setFriendSearchQuery(e.target.value)}
                  placeholder="Search name or username"
                  disabled={!isSignedIn}
                  maxLength={40}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${bd}`,
                    background: "rgba(255,255,255,0.05)", color: "var(--fkh-text)", fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
                {friendSearchQuery.trim().length >= 2 && (
                  <div style={{ marginTop: 6 }}>
                    {searchLoading && (
                      <div style={{ fontSize: 11, color: "#64748b", padding: "6px 2px" }}>Searching…</div>
                    )}
                    {!searchLoading && searchResults.length === 0 && (
                      <div style={{ fontSize: 11, color: "#64748b", padding: "6px 2px" }}>No athletes found</div>
                    )}
                    {searchResults.map(a => {
                      // Search still matches on real name, but results show the
                      // username only — never a browsable directory of kids' real
                      // names (privacy). Avatar initial comes from the username too.
                      const handle = a.username || "athlete";
                      const prof = profileSnippet({
                        id: a.user_id,
                        display_name: handle,
                        avatar_url: a.avatar_url,
                      });
                      const selected = selectedAthlete?.user_id === a.user_id;
                      return (
                        <button
                          key={a.user_id}
                          type="button"
                          onClick={() => setSelectedAthlete(a)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, width: "100%",
                            padding: "8px 10px", marginBottom: 4, borderRadius: 10, cursor: "pointer",
                            border: `1px solid ${selected ? P : bd}`,
                            background: selected ? `${P}18` : "rgba(255,255,255,0.03)",
                            textAlign: "left",
                          }}
                        >
                          <FriendAvatar profile={prof} displayName={handle} size={36} P={P} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fkh-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              @{handle}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleSendRequest}
                  disabled={!isSignedIn || !selectedAthlete || sendingRequest}
                  style={{
                    width: "100%", marginTop: 8, padding: "10px 16px", borderRadius: 8, border: "none",
                    background: isSignedIn && selectedAthlete && !sendingRequest ? P : `${P}55`,
                    color: "#000", fontSize: 12, fontWeight: 800,
                    cursor: isSignedIn && selectedAthlete && !sendingRequest ? "pointer" : "not-allowed",
                  }}
                >
                  {sendingRequest ? "Sending…" : "Add friend"}
                </button>
              </div>

              {sentRequests.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                    Your requests
                  </div>
                  {sentRequests.map(r => {
                    const statusLabel = r.status === "pending" ? "Pending"
                      : r.status === "accepted" ? "Accepted"
                      : r.status === "declined" ? "Declined" : r.status;
                    const statusColor = r.status === "accepted" ? "#22c55e"
                      : r.status === "declined" ? "#94a3b8" : P;
                    return (
                      <div key={r.id} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                        borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${bd}`, marginBottom: 4,
                      }}>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--fkh-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.username ? `@${r.username}` : "Athlete"}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, flexShrink: 0 }}>{statusLabel}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 10 }}>
                Or share a one-time code:
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button type="button" onClick={handleCreateInvite} disabled={!isSignedIn} style={{
                  flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${P}44`,
                  background: "transparent", color: isSignedIn ? P : "#64748b", fontSize: 11, fontWeight: 700,
                  cursor: isSignedIn ? "pointer" : "not-allowed", opacity: isSignedIn ? 1 : 0.6,
                }}>Get friend code</button>
              </div>
              {inviteCode && (
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: P, letterSpacing: "0.15em", marginBottom: 8 }}>
                  {inviteCode}
                </div>
              )}
              {inviteCode && (
                <div style={{ fontSize: 10, color: "#64748b", wordBreak: "break-all", marginBottom: 8 }}>
                  Link: {getInviteUrl(inviteCode)}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={inviteInput}
                  onChange={e => setInviteInput(e.target.value.toUpperCase())}
                  placeholder="Enter friend code"
                  maxLength={6}
                  style={{
                    flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${bd}`,
                    background: "rgba(255,255,255,0.05)", color: "var(--fkh-text)", fontSize: 13,
                  }}
                />
                <button type="button" onClick={handleAcceptInvite} style={{
                  padding: "8px 14px", borderRadius: 8, border: "none", background: P,
                  color: "#000", fontSize: 11, fontWeight: 800, cursor: "pointer",
                }}>Redeem</button>
              </div>
              {friendMsg && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>{friendMsg}</div>}
            </div>
          )}

          {squadTab === "friends" && (
            <>
              {!isSignedIn && (
                <div style={{
                  marginBottom: 12, padding: "10px 12px", borderRadius: 10,
                  background: `${P}12`, border: `1px solid ${P}28`, fontSize: 11, color: "var(--fkh-text-muted)", lineHeight: 1.5,
                }}>
                  🔒 Save your player to see your squad and message friends.
                  <button type="button" onClick={onOpenAuth} style={{
                    display: "block", marginTop: 8, padding: "8px 12px", borderRadius: 8, border: `1px solid ${P}44`,
                    background: "transparent", color: P, fontSize: 11, fontWeight: 700, cursor: "pointer", width: "100%",
                  }}>Save your player</button>
                </div>
              )}

              {/* 3.2 — accept in place. Adding a friend used to live only on
                  the fourth tab, and the empty state had to point you there. */}
              {requests.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                    Pending requests ({requests.length})
                  </div>
                  {requests.map(r => {
                    const prof = requesterProfiles[r.requester_id] || profileSnippet({
                      id: r.requester_id,
                      display_name: r.display_name,
                    });
                    return (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: `${P}10`, border: `1px solid ${P}22`, marginBottom: 6 }}>
                        <FriendAvatar
                          profile={prof}
                          displayName={r.username || "athlete"}
                          size={36}
                          P={P}
                          onPress={() => viewFriend(r.requester_id)}
                        />
                        <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--fkh-text)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            onClick={() => viewFriend(r.requester_id)}
                            style={{
                              background: "none", border: "none", padding: 0, margin: 0,
                              font: "inherit", fontWeight: 700, color: "var(--fkh-text)",
                              cursor: "pointer", textDecoration: "underline",
                            }}
                          >
                            @{r.username || "athlete"}
                          </button>
                        </div>
                        <button type="button" onClick={() => handleRespond(r.id, true)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: P, color: "#000", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>Accept</button>
                        <button type="button" onClick={() => handleRespond(r.id, false)} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${bd}`, background: "transparent", color: "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Decline</button>
                      </div>
                    );
                  })}
                </div>
              )}


              {isSignedIn && friendRoster.length === 0 && (
                <div style={{
                  marginBottom: 14, padding: "14px 12px", borderRadius: 12,
                  background: `${P}0c`, border: `1px solid ${P}22`, fontSize: 12, color: "#94a3b8", lineHeight: 1.5,
                }}>
                  No friends yet. Tap <strong style={{ color: P }}>+ Add</strong> up top to search for someone or share a friend code.
                </div>
              )}

              {friendRoster.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ ...lbl, marginBottom: 8 }}>Your squad</div>
                  {friendRoster.map(({ profile: prof, username, stats }) => (
                    /* A row, not a button: the video action needs to sit beside
                       the profile tap target, and a button cannot nest inside a
                       button. */
                    <div
                      key={prof.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "10px 12px", marginBottom: 8, borderRadius: 12,
                        border: `1px solid ${bd}`, background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => viewFriend(prof.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0,
                          padding: 0, border: "none", background: "transparent",
                          cursor: "pointer", textAlign: "left",
                        }}
                      >
                        <FriendAvatar profile={prof} size={48} P={P} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--fkh-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {prof.displayName}
                          </div>
                          {username && (
                            <div style={{ fontSize: 11, color: P, fontWeight: 700, marginTop: 2 }}>@{username}</div>
                          )}
                          <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {friendOverviewLine(prof, stats)}
                          </div>
                        </div>
                      </button>
                      {/* Only rendered when the server says video exists at all.
                          Whether these two specific athletes may call is decided
                          per-attempt by the server, which can explain a refusal
                          better than a hidden button can. */}
                      {canVideo && (
                        <button
                          type="button"
                          aria-label={`Train with ${prof.displayName} on video`}
                          onClick={() => setVideoFriend({ id: prof.id, display_name: prof.displayName })}
                          style={{
                            flexShrink: 0, width: 40, height: 40, borderRadius: 10, cursor: "pointer",
                            border: `1px solid ${P}44`, background: `${P}18`, color: P, fontSize: 16,
                          }}
                        >📹</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 3.5 — squad challenges expand in place rather than linking out. */}
              <div style={{ marginBottom: 8 }}>
                <button type="button" onClick={() => setSquadChallengesOpen(o => !o)}
                  aria-expanded={squadChallengesOpen}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                    borderRadius: 12, cursor: "pointer", textAlign: "left",
                    border: `1px solid ${bd}`, background: "rgba(255,255,255,0.03)" }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, color: P }}>🏆 Squad challenges</span>
                  {challengeActivity > 0 && <CountBadge count={challengeActivity} P={P} />}
                  <span style={{ fontSize: 12, color: "#475569", lineHeight: 1,
                    transform: squadChallengesOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
                </button>
                {squadChallengesOpen && (
                  <div style={{ marginTop: 10 }}>
                    <ChallengesActivePanel
                      personalChallenges={personalChallenges}
                      P={P}
                      SF={SF}
                      bd={bd}
                      squadOnly
                      onAddFriends={() => onOpenAdd?.()}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {squadTab === "feed" && (
            <FeedView P={P} SF={SF} bd={bd} onViewFriend={viewFriend} />
          )}

          {squadTab === "messages" && (
            isSignedIn ? (
              <MessagesPanel
                P={P}
                SF={SF}
                bd={bd}
                embedded
                initialFriend={messageFriend}
                onUnreadChange={onUnreadRefresh}
              />
            ) : (
              <div style={{ padding: "20px 12px", fontSize: 12, color: "#94a3b8", textAlign: "center", lineHeight: 1.5 }}>
                🔒 Save your player to message friends.
                <button type="button" onClick={onOpenAuth} style={{
                  display: "block", margin: "10px auto 0", padding: "8px 16px", borderRadius: 8,
                  border: `1px solid ${P}44`, background: "transparent", color: P, fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>Save your player</button>
              </div>
            )
          )}

        </div>
      ) : (<>

      {!configured && (
        <div style={{
          background: `${P}12`, border: `1px solid ${P}30`, borderRadius: 14,
          padding: "14px 16px", margin: "16px 0", fontSize: 12, color: "var(--fkh-text-muted)", lineHeight: 1.55,
        }}>
          Challenges backend is not connected. Run <code style={{ color: P }}>supabase/schema.sql</code> and{" "}
          <code style={{ color: P }}>supabase/boards.sql</code> in your Supabase project.
        </div>
      )}

      <div style={{ display: "flex", gap: 6, margin: "16px 0 12px" }}>
        {BOARD_TYPES.map(b => (
          <button
            key={b.id}
            disabled={b.comingSoon}
            onClick={() => !b.comingSoon && setBoardType(b.id)}
            style={{
              flex: 1, padding: "9px 4px", borderRadius: 10, fontSize: 10, fontWeight: 700,
              cursor: b.comingSoon ? "not-allowed" : "pointer",
              border: `1px solid ${boardType === b.id ? P : bd}`,
              background: boardType === b.id ? `${P}18` : "transparent",
              color: boardType === b.id ? P : "#64748b",
              opacity: b.comingSoon ? 0.45 : 1,
            }}
          >
            {b.emoji} {b.label}
          </button>
        ))}
      </div>

      {boardType === "friends" && (
        <button type="button" onClick={() => setMode("friends")} style={{
          display: "block", width: "100%", marginBottom: 16, padding: "12px 14px", borderRadius: 12,
          border: `1px solid ${P}44`, background: `${P}10`, color: P, fontSize: 12, fontWeight: 800,
          cursor: "pointer", textAlign: "left",
        }}>
          👋 Add or manage friends →
          <div style={{ fontSize: 10, fontWeight: 500, color: "#64748b", marginTop: 4 }}>
            Friend codes, requests, and the friends feed live on the Friends tab
          </div>
        </button>
      )}

      {myRow && (
        <div style={{
          background: SF, border: `1px solid ${P}40`, borderRadius: 12,
          padding: "12px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 800, color: P, minWidth: 36 }}>
            #{myRank || "—"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fkh-text)" }}>
              You{boardType === "age_group" ? ` · ${getAgeGroupLabel(ageGroup)}` : ` · ${myRow.display_name}`}
            </div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
              {myRow.xp.toLocaleString()} XP · {myRow.shots_made.toLocaleString()} makes
            </div>
          </div>
        </div>
      )}

      <div style={lbl}>Time period</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {LEADERBOARD_PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)} style={{
            flex: 1, padding: "9px 4px", borderRadius: 10, fontSize: 10, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${period === p.id ? P : bd}`,
            background: period === p.id ? `${P}18` : "transparent",
            color: period === p.id ? P : "#64748b",
          }}>{p.label}</button>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={lbl}>Rankings</div>
      </div>

      {loading && rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: "#64748b", fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 32, color: "#64748b", fontSize: 13,
          background: SF, borderRadius: 14, border: `1px solid ${bd}`,
        }}>
          {boardType === "friends"
            ? "No friends on the board yet. Tap 👋 Friends above to add someone!"
            : "No rankings yet — train and sync to appear!"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row, i) => {
            const rank = i + 1;
            const isMe = row.athlete_id === athleteId;
            const rowTitle = row.active_title ? getAchievementMeta(row.active_title) : null;
            const canView = !isMe && boardType === "friends";
            return (
              <div key={row.athlete_id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12,
                background: isMe ? `${P}12` : SF,
                border: `1px solid ${isMe ? `${P}40` : bd}`,
              }}>
                <div style={{
                  fontFamily: "'DM Mono',monospace", fontSize: rank <= 3 ? 20 : 14,
                  fontWeight: 800, color: rank <= 3 ? P : "#64748b", minWidth: 28, textAlign: "center",
                }}>{medalForRank(rank)}</div>
                <FriendAvatar
                  profile={row.profile}
                  displayName={row.display_name}
                  size={40}
                  P={P}
                  onPress={canView ? () => viewFriend(row.athlete_id) : null}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    {canView ? (
                      <button
                        type="button"
                        onClick={() => viewFriend(row.athlete_id)}
                        style={{
                          background: "none", border: "none", padding: 0, margin: 0,
                          fontSize: 13, fontWeight: 700, color: "var(--fkh-text)",
                          cursor: "pointer", textDecoration: "underline",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          maxWidth: "100%", textAlign: "left",
                        }}
                      >
                        {row.display_name}
                      </button>
                    ) : (
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: isMe ? P : "var(--fkh-text)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {row.display_name}{isMe ? " (you)" : ""}
                      </span>
                    )}
                    {rowTitle && (
                      <span style={{
                        flexShrink: 0, fontSize: 9, fontWeight: 800, color: rowTitle.color,
                        background: `${rowTitle.color}1f`, border: `1px solid ${rowTitle.color}55`,
                        padding: "1px 6px", borderRadius: 999,
                      }}>{rowTitle.emoji} {rowTitle.name}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                    {row.shots_made.toLocaleString()} makes · {row.training_days} days
                    {row.streak >= 3 ? ` · 🔥 ${row.streak}d` : ""}
                    {row.play_like ? ` · 🎯 plays like ${row.play_like}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 800, color: P }}>
                    {row.xp.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 9, color: "#475569" }}>XP</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Plumbing, not the thing the kid came for — it sits under the board
          now instead of above it. */}
      <div style={{ marginTop: 16, borderTop: `1px solid ${bd}`, paddingTop: 12 }}>
        <button type="button" onClick={() => setBoardSettingsOpen(o => !o)}
          aria-expanded={boardSettingsOpen}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: 0,
            background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", flex: 1, minWidth: 0 }}>
            Board settings
            <span style={{ color: "#475569", fontWeight: 500 }}>
              {" · "}{fmtRelativePush(getLastPushTime()).toLowerCase()}
            </span>
          </span>
          <span style={{ fontSize: 12, color: "#475569", lineHeight: 1,
            transform: boardSettingsOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
        </button>

        {boardSettingsOpen && (
          <div style={{ marginTop: 12 }}>
        {boardType === "age_group" && (
          <>
            <div style={lbl}>Age group</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {AGE_GROUPS.map(g => (
                <button key={g.id} onClick={() => setAgeGroup(g.id)} style={{
                  padding: "7px 11px", borderRadius: 99, fontSize: 10, fontWeight: 700, cursor: "pointer",
                  border: `1px solid ${ageGroup === g.id ? P : bd}`,
                  background: ageGroup === g.id ? `${P}20` : "transparent",
                  color: ageGroup === g.id ? P : "#64748b",
                }}>{g.label}</button>
              ))}
            </div>
          </>
        )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSyncNow} disabled={!configured || pushing} style={{
                flex: 1, padding: "9px 12px", borderRadius: 10, background: "transparent",
                border: `1px solid ${configured ? P : "rgba(255,255,255,0.12)"}`,
                color: configured ? P : "#64748b",
                fontSize: 11, fontWeight: 700, cursor: configured ? "pointer" : "not-allowed",
              }}>{pushing ? "Syncing…" : "Sync now"}</button>
              <button onClick={load} disabled={loading || !configured} style={{
                flex: 1, padding: "9px 12px", borderRadius: 10, background: "transparent",
                border: `1px solid ${bd}`, color: "#94a3b8",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}>{loading ? "…" : "↻ Refresh"}</button>
            </div>
            {pushMsg && <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 700, marginTop: 8 }}>{pushMsg}</div>}
            {error && <div style={{ fontSize: 11, color: "#f87171", marginTop: 8 }}>{error}</div>}
          </div>
        )}
      </div>
      </>)}
      {friendProfileId && (
        <FriendProfileSheet
          athleteId={friendProfileId}
          P={P}
          BG={BG || "#0b1220"}
          bd={bd}
          onClose={() => setFriendProfileId(null)}
          onMessage={f => {
            setFriendProfileId(null);
            if (isSquadLayout) openMessageWithFriend(f);
            else setMessageFriend(f);
          }}
        />
      )}
      {messageFriend && !isSquadLayout && (
        <MessagesSheet
          P={P}
          SF={SF}
          bd={bd}
          initialFriend={messageFriend === "inbox" ? null : messageFriend}
          onClose={() => setMessageFriend(null)}
          onUnreadChange={onUnreadRefresh}
        />
      )}

      {videoFriend && (
        <Suspense fallback={null}>
          <BuddyVideoSheet
            P={P}
            friend={videoFriend}
            onClose={() => setVideoFriend(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
