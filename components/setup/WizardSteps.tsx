'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Mail, Upload, FolderOpen, ArrowRight, Shield, Globe, Play, FileText, CheckCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { DriveFolderSelector } from '@/components/drive-folder-selector'
import Link from 'next/link'

// --- STEP 1: WELCOME & SOURCES ---
export function StepSources({
    sources,
    toggleSource,
    onNext,
    loading
}: any) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Bem-vindo! Configurar Canais</CardTitle>
                <CardDescription>
                    Escolha como pretende recolher as suas faturas.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* Gmail Sync */}
                <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
                    <div className="flex items-center space-x-4">
                        <div className="h-10 w-10 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                            <Mail className="h-5 w-5 text-red-600" />
                        </div>
                        <div className="space-y-0.5">
                            <Label className="text-base">Sincronização Gmail</Label>
                            <p className="text-sm text-muted-foreground">
                                Digitaliza o seu Gmail para encontrar faturas automaticamente.
                            </p>
                        </div>
                    </div>
                    <Switch
                        checked={sources.gmail}
                        onCheckedChange={() => toggleSource('gmail')}
                    />
                </div>

                {/* Drive Inbox */}
                <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
                    <div className="flex items-center space-x-4">
                        <div className="h-10 w-10 flex items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/20">
                            <FolderOpen className="h-5 w-5 text-yellow-600" />
                        </div>
                        <div className="space-y-0.5">
                            <Label className="text-base">Pasta Inbox no Drive</Label>
                            <p className="text-sm text-muted-foreground">
                                Uma pasta &quot;Inbox&quot; para onde pode arrastar ficheiros.
                            </p>
                        </div>
                    </div>
                    <Switch
                        checked={sources.drive_inbox}
                        onCheckedChange={() => toggleSource('drive_inbox')}
                    />
                </div>

                {/* Email Forwarding - hidden until the feature is ready
                <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
                    <div className="flex items-center space-x-4">
                        <div className="h-10 w-10 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20">
                            <ArrowRight className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="space-y-0.5">
                            <Label className="text-base">Reencaminhamento de Email</Label>
                            <p className="text-sm text-muted-foreground">
                                Envie faturas para um endereço único (ex: user@entuaava...).
                            </p>
                        </div>
                    </div>
                    <Switch
                        checked={sources.forwarding}
                        onCheckedChange={() => toggleSource('forwarding')}
                    />
                </div>
                */}

            </CardContent>
            <CardFooter className="flex justify-end">
                <Button onClick={onNext} className="w-full sm:w-auto">
                    Continuar <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </CardFooter>
        </Card>
    )
}

// --- STEP 1.5: CONNECT GOOGLE ---
export function StepConnect({ onNext, onPrev, loading, isConnected, sources, hasGmailScope }: any) {

    // Customize text based on what we are doing
    const isSyncing = sources?.gmail

    // Determine if we are "fully" connected relative to requirement
    // If syncing is requested, we NEED hasGmailScope
    // If only storage requested, any connection (isConnected) is valid (assuming base is storage)
    const permissionsSatisfied = isSyncing ? (isConnected && hasGmailScope) : isConnected
    const needsUpgrade = isConnected && !permissionsSatisfied

    if (permissionsSatisfied) {
        // Auto-advance or show connected state
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Conta Conectada!</CardTitle>
                    <CardDescription>A sua conta Google foi conectada com sucesso.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-8">
                    <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                        <Check className="h-8 w-8 text-green-600" />
                    </div>
                    <p className="text-center text-muted-foreground">Podemos agora configurar as suas pastas.</p>
                </CardContent>
                <CardFooter className="flex justify-between">
                    <Button variant="outline" onClick={onPrev}>Voltar</Button>
                    <div className="flex gap-2">
                        <Link href={`/api/gmail/connect${!isSyncing ? '?mode=storage' : ''}`}>
                            <Button variant="outline">Reconectar</Button>
                        </Link>
                        <Button onClick={onNext}>Continuar <ArrowRight className="ml-2 h-4 w-4" /></Button>
                    </div>
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    {needsUpgrade ? 'Atualizar Permissões' : 'Conectar Conta Google'}
                </CardTitle>
                <CardDescription>
                    {needsUpgrade
                        ? 'Para ativar a sincronização do Gmail, precisamos de atualizar as permissões da sua conta.'
                        : isSyncing
                            ? 'Para criar pastas e sincronizar emails, precisamos de acesso à sua conta.'
                            : 'Para guardar os seus documentos, precisamos de acesso ao seu Google Drive.'
                    }
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="bg-muted p-4 rounded-lg flex items-start space-x-3">
                    <Shield className="h-5 w-5 text-primary mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                        <p className="font-medium text-foreground mb-1">Porquê conectar?</p>
                        <ul className="list-disc pl-4 space-y-1">
                            <li>Para criar a pasta &quot;Invoice Collector&quot; no seu Drive.</li>
                            {isSyncing && <li>Para digitalizar a sua caixa de entrada.</li>}
                            <li>Pode revogar o acesso a qualquer momento.</li>
                        </ul>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={onPrev}>Voltar</Button>
                <Link href={`/api/gmail/connect${!isSyncing ? '?mode=storage' : ''}`}>
                    <Button>
                        <Mail className="mr-2 h-4 w-4" />
                        {needsUpgrade ? 'Atualizar Permissões' : 'Conectar Google'}
                    </Button>
                </Link>
            </CardFooter>
        </Card>
    )
}


// --- STEP 2: MASTER FOLDER ---
export function StepMasterFolder({
    onNext,
    onPrev,
    loading,
    saveFolder
}: any) {
    const [selectedFolder, setSelectedFolder] = useState<{ id: string, name: string, path: string } | null>(null)

    const handleContinue = async () => {
        if (selectedFolder) {
            await saveFolder(selectedFolder.id, selectedFolder.name, selectedFolder.path)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Pasta Principal</CardTitle>
                <CardDescription>
                    Onde devemos guardar tudo? Criaremos subpastas para Pendentes e Aprovados (e Inbox se seleccionada).
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <DriveFolderSelector
                    onSelect={(id, name, path) => setSelectedFolder({ id, name, path })}
                />
            </CardContent>
            <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={onPrev} disabled={loading}>Voltar</Button>
                <Button onClick={handleContinue} disabled={loading || !selectedFolder}>
                    {loading ? 'A configurar...' : 'Configurar Pastas'}
                </Button>
            </CardFooter>
        </Card>
    )
}

// --- STEP 3: CONFIGURATION (Unique Email) & EDUCATION ---
export function StepEducation({
    sources,
    inboundEmail,
    generateEmail,
    onFinish,
    loading
}: any) {

    // Generate email if forwarding is on and no email yet
    useEffect(() => {
        if (sources.forwarding && !inboundEmail) {
            generateEmail()
        }
    }, [sources.forwarding, inboundEmail, generateEmail])

    return (
        <Card>
            <CardHeader>
                <CardTitle>Tudo Pronto!</CardTitle>
                <CardDescription>
                    Eis como o Invoice Collector vai funcionar.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* Email Display if applicable */}
                {sources.forwarding && (
                    <EmailCopySection email={inboundEmail} />
                )}

                {/* Workflow Explainer */}
                <div className="space-y-4">
                    <h4 className="font-medium">O Ciclo de Vida da Fatura:</h4>

                    <div className="space-y-3 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">

                        {/* 1. Collect */}
                        <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div className="flex items-center justify-center w-5 h-5 rounded-full border border-white bg-slate-300 group-hover:bg-slate-500 text-slate-500 group-hover:text-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow shrink-0">
                                1
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded border bg-card shadow-sm">
                                <div className="font-semibold text-sm">Recolha</div>
                                <div className="text-xs text-muted-foreground">O sistema recolhe faturas via Gmail, Inbox Drive ou Email.</div>
                            </div>
                        </div>

                        {/* 2. Process */}
                        <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div className="flex items-center justify-center w-5 h-5 rounded-full border border-white bg-slate-300 group-hover:bg-slate-500 text-slate-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">
                                2
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded border bg-card shadow-sm">
                                <div className="font-semibold text-sm">Processamento (Pendente)</div>
                                <div className="text-xs text-muted-foreground">Faturas vão para a pasta &quot;Pendentes&quot;. Extraímos os dados automaticamente.</div>
                            </div>
                        </div>

                        {/* 3. Approve */}
                        <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div className="flex items-center justify-center w-5 h-5 rounded-full border border-white bg-slate-300 group-hover:bg-slate-500 text-slate-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">
                                3
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded border bg-card shadow-sm">
                                <div className="font-semibold text-sm">Aprovação</div>
                                <div className="text-xs text-muted-foreground">Você valida os dados no Dashboard.</div>
                            </div>
                        </div>

                        {/* 4. Done */}
                        <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div className="flex items-center justify-center w-5 h-5 rounded-full border border-white bg-slate-300 group-hover:bg-slate-500 text-slate-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">
                                4
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded border bg-card shadow-sm">
                                <div className="font-semibold text-sm">Contabilidade</div>
                                <div className="text-xs text-muted-foreground">Movemos para &quot;Aprovados&quot;. Partilhe esta pasta com o seu contabilista!</div>
                            </div>
                        </div>

                    </div>
                </div>

            </CardContent>
            <CardFooter className="flex justify-center">
                <Button onClick={onFinish} size="lg" disabled={loading} className="w-full">
                    {loading ? 'A Preparar Demo...' : 'Começar a Usar'}
                </Button>
            </CardFooter>
        </Card>
    )
}

function EmailCopySection({ email }: { email: string | null }) {
    const [copied, setCopied] = useState(false)

    const handleCopy = () => {
        if (!email) return
        navigator.clipboard.writeText(email)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 p-4 border border-blue-100 dark:border-blue-900/30">
            <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center">
                <Mail className="h-4 w-4 mr-2" /> O seu Email de Entrada
            </h4>
            <div className="flex items-center gap-2 bg-background p-2 rounded border">
                <code className="text-sm flex-1 truncate">{email || 'A gerar...'}</code>
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                    {copied ? (
                        <>
                            <Check className="h-3 w-3 mr-1.5 text-green-600" />
                            <span className="text-green-600">Copiado</span>
                        </>
                    ) : (
                        'Copiar'
                    )}
                </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
                Envie ou reencaminhe faturas para este endereço.
            </p>
        </div>
    )
}
