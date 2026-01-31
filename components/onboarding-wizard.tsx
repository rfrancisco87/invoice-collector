'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Mail, RefreshCw, FileText, CheckCircle2, ArrowRight, ArrowLeft, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface OnboardingWizardProps {
    open: boolean
    onClose: () => void
}

export function OnboardingWizard({ open, onClose }: OnboardingWizardProps) {
    const [currentStep, setCurrentStep] = useState(0)
    const [isCreatingDemo, setIsCreatingDemo] = useState(false)
    const router = useRouter()

    const steps = [
        {
            title: 'Bem-vindo ao Invoice Collector!',
            description: 'Organize e gerencie suas faturas automaticamente',
            icon: CheckCircle2,
            content: () => (
                <div className="space-y-4">
                    <p className="text-muted-foreground">
                        O Invoice Collector ajuda a:
                    </p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex items-start gap-2">
                            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                            <span>Sincronizar faturas automaticamente do Gmail</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                            <span>Classificar documentos (Faturas e Notas de Crédito)</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                            <span>Organizar tudo no Google Drive</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                            <span>Aprovar ou rejeitar documentos facilmente</span>
                        </li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-6">
                        Vamos configurar tudo em apenas alguns passos!
                    </p>
                </div>
            )
        },
        {
            title: 'Conecte sua Conta Gmail',
            description: 'Precisamos acessar seus emails para encontrar faturas',
            icon: Mail,
            content: () => (
                <div className="space-y-4">
                    <p className="text-muted-foreground">
                        Para sincronizar suas faturas, precisa de conectar sua conta Gmail.
                    </p>
                    <div className="bg-muted p-4 rounded-lg space-y-2">
                        <h4 className="font-medium text-sm">O que vamos consultar:</h4>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            <li>• Emails com anexos PDF</li>
                            <li>• Permissão para criar etiquetas</li>
                            <li>• Acesso ao Google Drive para organização</li>
                        </ul>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Os seus dados estão seguros e nunca compartilhamos qualquer informação com terceiros.
                    </p>
                </div>
            )
        },
        {
            title: 'Sincronização e Organização',
            description: 'Como funciona a busca e organização de faturas',
            icon: RefreshCw,
            content: () => (
                <div className="space-y-4">
                    <p className="text-muted-foreground">
                        O Invoice Collector irá sincronizar e organizar automaticamente suas faturas:
                    </p>
                    <div className="space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="bg-primary/10 p-2 rounded-lg">
                                <span className="text-primary font-bold">1</span>
                            </div>
                            <div>
                                <h4 className="font-medium text-sm">Primeira Sincronização</h4>
                                <p className="text-sm text-muted-foreground">
                                    Buscaremos faturas dos últimos 10 dias nos seus emails
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="bg-primary/10 p-2 rounded-lg">
                                <span className="text-primary font-bold">2</span>
                            </div>
                            <div>
                                <h4 className="font-medium text-sm">Seleção de Pasta no Drive</h4>
                                <p className="text-sm text-muted-foreground">
                                    Você escolherá uma pasta no Google Drive onde os documentos serão organizados
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="bg-primary/10 p-2 rounded-lg">
                                <span className="text-primary font-bold">3</span>
                            </div>
                            <div>
                                <h4 className="font-medium text-sm">Organização Automática</h4>
                                <p className="text-sm text-muted-foreground">
                                    Documentos pendentes ficam numa pasta temporária. Após aprovação, são movidos para a pasta definitiva no Drive
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="bg-primary/10 p-2 rounded-lg">
                                <span className="text-primary font-bold">4</span>
                            </div>
                            <div>
                                <h4 className="font-medium text-sm">Sincronização Contínua</h4>
                                <p className="text-sm text-muted-foreground">
                                    Verificamos novos emails periodicamente baseado no seu plano
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )
        },
        {
            title: 'Tudo pronto para começar!',
            description: 'Vamos conectar sua conta Google',
            icon: FileText,
            content: () => (
                <div className="space-y-4">
                    <p className="text-muted-foreground">
                        Para finalizar a configuração, vamos redirecionar você para a página de configurações.
                    </p>
                    <div className="bg-muted p-4 rounded-lg space-y-2">
                        <h4 className="font-medium text-sm">Próximos passos nas Configurações:</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li className="flex items-center gap-2">
                                <span className="bg-primary/20 text-primary w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold">1</span>
                                Conectar sua conta Gmail
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="bg-primary/20 text-primary w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold">2</span>
                                Selecionar a pasta do Google Drive
                            </li>
                        </ul>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Criamos uma fatura de demonstração para você ver o sistema em ação assim que terminar a configuração.
                    </p>
                </div>
            )
        }
    ]

    const progress = ((currentStep + 1) / steps.length) * 100

    const handleNext = async () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1)
            // Update step in backend
            await fetch('/api/onboarding/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update_step', step: currentStep + 1 })
            })
        } else {
            await handleComplete()
        }
    }

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1)
        }
    }

    const handleComplete = async () => {
        try {
            setIsCreatingDemo(true)

            // Create demo invoice
            await fetch('/api/onboarding/demo-invoice', {
                method: 'POST'
            })

            // Mark onboarding as complete
            await fetch('/api/onboarding/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'complete' })
            })

            onClose()
            router.push('/settings')
        } catch (error) {
            console.error('Error completing onboarding:', error)
        } finally {
            setIsCreatingDemo(false)
        }
    }

    const handleSkip = async () => {
        await handleComplete()
    }

    const StepIcon = steps[currentStep]?.icon

    if (!steps[currentStep]) {
        return null
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" hideClose>
                <DialogHeader>
                    <DialogTitle className="text-2xl">{steps[currentStep].title}</DialogTitle>
                    <DialogDescription>{steps[currentStep].description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Progress Bar */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Passo {currentStep + 1} de {steps.length}</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                    </div>

                    {/* Icon */}
                    <div className="flex justify-center">
                        <div className="bg-primary/10 p-6 rounded-full">
                            <StepIcon className="h-12 w-12 text-primary" />
                        </div>
                    </div>

                    {/* Content */}
                    <div className="h-[320px] overflow-y-auto">
                        {steps[currentStep].content()}
                    </div>

                    {/* Navigation */}
                    <div className="flex justify-between pt-4">
                        <Button
                            variant="outline"
                            onClick={handleBack}
                            disabled={currentStep === 0}
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Anterior
                        </Button>

                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                onClick={handleSkip}
                            >
                                Pular
                            </Button>

                            <Button
                                onClick={handleNext}
                                disabled={isCreatingDemo}
                            >
                                {currentStep === steps.length - 1 ? (
                                    isCreatingDemo ? (
                                        'Criando...'
                                    ) : (
                                        <>
                                            Ir para Configurações
                                            <CheckCircle2 className="h-4 w-4 ml-2" />
                                        </>
                                    )
                                ) : (
                                    <>
                                        Próximo
                                        <ArrowRight className="h-4 w-4 ml-2" />
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
