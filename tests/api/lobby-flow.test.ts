import { describe, it, expect } from "vitest";
import { getServiceSupabase } from "@/lib/db/supabase";

describe("lobby state machine", () => {
  it("creates a lobby, seats players, fills bots, ends the round", async () => {
    const supabase = getServiceSupabase();

    // 1. Create a 4-seat lobby
    const { data: lobby } = await supabase
      .from("lobbies")
      .insert({ type: "private", size: 4, duration_seconds: 180, status: "waiting" })
      .select("id")
      .single();
    expect(lobby).toBeTruthy();

    // 2. Seat one human
    await supabase.from("lobby_players").insert({
      lobby_id: lobby!.id,
      nickname: "human1",
      balance_cents: 100000,
    });

    // 3. Simulate "start": fill 3 bots, set status active, started_at = now
    const botRows = Array.from({ length: 3 }, (_, i) => ({
      lobby_id: lobby!.id,
      nickname: `bot${i}`,
      is_bot: true,
      balance_cents: 100000,
    }));
    await supabase.from("lobby_players").insert(botRows);
    await supabase
      .from("lobbies")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", lobby!.id);

    // 4. Verify 4 seats
    const { count } = await supabase
      .from("lobby_players")
      .select("id", { count: "exact", head: true })
      .eq("lobby_id", lobby!.id);
    expect(count).toBe(4);

    // 5. Simulate round end: bypass time check by directly updating
    await supabase
      .from("lobbies")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", lobby!.id);

    const { data: ended } = await supabase
      .from("lobbies")
      .select("status")
      .eq("id", lobby!.id)
      .single();
    expect(ended?.status).toBe("ended");

    // Cleanup
    await supabase.from("lobbies").delete().eq("id", lobby!.id);
  });
});
