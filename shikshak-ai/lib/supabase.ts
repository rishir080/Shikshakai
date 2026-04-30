import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fagcusjvgxjclyoijwpy.supabase.co"
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_WICslH68euxyBOOvfuRXFg_HGr0x1po"

export const supabase = createClient(supabaseUrl, supabaseKey)
