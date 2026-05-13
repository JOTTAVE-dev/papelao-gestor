import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Profile = {
  role: 'super_admin' | 'owner' | 'operator';
  company_id: string | null;
  company_owner_id: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Variaveis da funcao Supabase nao configuradas.');
    }

    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData.user) {
      throw new Error('Sessao invalida.');
    }

    const { data: requester, error: profileError } = await adminClient
      .from('profiles')
      .select('role, company_id, company_owner_id')
      .eq('id', userData.user.id)
      .single<Profile>();

    if (profileError || !requester) {
      throw new Error('Perfil do usuario atual nao encontrado.');
    }

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();
    const role = body.role === 'owner' ? 'owner' : 'operator';
    const companyName = String(body.companyName || '').trim();
    const companyId = body.companyId ? String(body.companyId) : '';
    const userLimit = Math.max(0, Number(body.userLimit || 0));

    if (!email || !password || password.length < 6 || !name) {
      throw new Error('Informe nome, email e senha com pelo menos 6 caracteres.');
    }

    if (role === 'owner' && requester.role !== 'super_admin') {
      throw new Error('Apenas o admin geral pode criar proprietarios.');
    }

    if (role === 'operator' && !['super_admin', 'owner'].includes(requester.role)) {
      throw new Error('Apenas admin geral ou proprietario podem criar usuarios.');
    }

    let targetCompanyId = companyId;
    let targetOwnerId: string | null = null;

    if (role === 'operator') {
      if (requester.role === 'owner') {
        if (!requester.company_id || !requester.company_owner_id) {
          throw new Error('Empresa do proprietario nao encontrada.');
        }
        targetCompanyId = requester.company_id;
        targetOwnerId = requester.company_owner_id;
      } else if (!targetCompanyId) {
        throw new Error('Selecione a empresa para criar o subusuario.');
      }

      const { data: company, error: companyError } = await adminClient
        .from('companies')
        .select('id, owner_id, user_limit')
        .eq('id', targetCompanyId)
        .single();

      if (companyError || !company?.owner_id) {
        throw new Error('Empresa invalida ou sem proprietario.');
      }

      targetOwnerId = company.owner_id;

      const { count, error: countError } = await adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', targetCompanyId)
        .eq('role', 'operator');

      if (countError) throw countError;
      if ((count || 0) >= company.user_limit) {
        throw new Error('Limite de subusuarios atingido para esta empresa.');
      }
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (createError || !created.user) {
      throw createError || new Error('Usuario nao criado.');
    }

    if (role === 'owner') {
      const { data: company, error: companyError } = await adminClient
        .from('companies')
        .insert({
          name: companyName || name,
          owner_id: created.user.id,
          user_limit: userLimit,
        })
        .select('id')
        .single();

      if (companyError || !company) throw companyError || new Error('Empresa nao criada.');
      targetCompanyId = company.id;
      targetOwnerId = created.user.id;
    }

    const { error: upsertError } = await adminClient.from('profiles').upsert({
      id: created.user.id,
      email,
      name,
      role,
      company_id: targetCompanyId || null,
      company_owner_id: targetOwnerId || created.user.id,
    });

    if (upsertError) {
      throw upsertError;
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro ao criar usuario.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
