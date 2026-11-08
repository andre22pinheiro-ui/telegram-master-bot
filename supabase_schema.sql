-- ESQUEMA SQL PARA O SUPABASE (GESTOR FAMILIAR TELEGRAM MINI APP)
-- Executar no SQL Editor do teu Dashboard Supabase:

-- 1. Tabela de Lista de Compras Familiar
CREATE TABLE IF NOT EXISTS public.family_shopping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_text TEXT NOT NULL,
    category TEXT DEFAULT 'geral', -- 'supermercado', 'bebe', 'farmacia', 'casa'
    completed BOOLEAN DEFAULT FALSE,
    created_by_name TEXT,
    created_by_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Tarefas da Casa & Família
CREATE TABLE IF NOT EXISTS public.family_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    assigned_to TEXT, -- 'André', 'Esposa', 'Ambos'
    due_date DATE,
    completed BOOLEAN DEFAULT FALSE,
    created_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Cuidados & Horários da Bebé
CREATE TABLE IF NOT EXISTS public.family_baby_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL, -- 'alimentacao', 'sono', 'fralda', 'vacina', 'medicamento'
    details TEXT NOT NULL,    -- ex: 'Biberão 180ml', 'Dorme sesta', 'Paracetamol 2.5ml'
    logged_time TIMESTAMPTZ DEFAULT NOW(),
    created_by_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabela de Notas Rápidas & Ideias Partilhadas
CREATE TABLE IF NOT EXISTS public.family_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    color_tag TEXT DEFAULT 'blue',
    created_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.family_shopping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_baby_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_notes ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso livre com chave Anon/Service (Ambiente Familiar Seguro)
CREATE POLICY "Permitir leitura total para utilizadores autenticados" ON public.family_shopping FOR ALL USING (true);
CREATE POLICY "Permitir leitura total para tarefas" ON public.family_tasks FOR ALL USING (true);
CREATE POLICY "Permitir leitura total para logs bebe" ON public.family_baby_logs FOR ALL USING (true);
CREATE POLICY "Permitir leitura total para notas" ON public.family_notes FOR ALL USING (true);

