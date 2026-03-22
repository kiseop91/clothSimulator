import { supabase } from './supabase';

export async function checkAIQuota(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('ai_usage')
    .select('generation_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('checkAIQuota error:', error);
    return { allowed: true, remaining: 5 };
  }

  const count = data?.generation_count ?? 0;
  return { allowed: count < 5, remaining: Math.max(0, 5 - count) };
}

export async function incrementAIUsage(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('ai_usage')
    .select('generation_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .single();

  if (data) {
    await supabase
      .from('ai_usage')
      .update({ generation_count: data.generation_count + 1 })
      .eq('user_id', userId)
      .eq('usage_date', today);
  } else {
    await supabase
      .from('ai_usage')
      .insert({ user_id: userId, usage_date: today, generation_count: 1 });
  }
}
