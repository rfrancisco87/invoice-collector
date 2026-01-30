'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CheckCircle2, AlertCircle, Info, XCircle } from 'lucide-react'

export default function DesignSystemPage() {
    // Note: This page is publicly accessible to showcase the design system
    // No authentication required

    return (
        <div className="min-h-screen flex flex-col">
            <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
                <div className="space-y-12">
                    {/* Header */}
                    <div>
                        <h1 className="text-4xl font-bold">Design System</h1>
                        <p className="text-muted-foreground mt-2">
                            A comprehensive showcase of all UI components and design tokens
                        </p>
                    </div>

                    {/* Colors */}
                    <section className="space-y-4">
                        <h2 className="text-2xl font-semibold">Colors</h2>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Background</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-20 rounded-lg bg-background border border-border"></div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Foreground</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-20 rounded-lg bg-foreground"></div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Primary</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-20 rounded-lg bg-primary"></div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Secondary</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-20 rounded-lg bg-secondary"></div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Accent</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-20 rounded-lg bg-accent"></div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Destructive</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-20 rounded-lg bg-destructive"></div>
                                </CardContent>
                            </Card>
                        </div>
                    </section>

                    {/* Typography */}
                    <section className="space-y-4">
                        <h2 className="text-2xl font-semibold">Typography</h2>
                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                <div>
                                    <h1 className="text-4xl font-bold">Heading 1</h1>
                                    <p className="text-sm text-muted-foreground">text-4xl font-bold</p>
                                </div>
                                <div>
                                    <h2 className="text-3xl font-semibold">Heading 2</h2>
                                    <p className="text-sm text-muted-foreground">text-3xl font-semibold</p>
                                </div>
                                <div>
                                    <h3 className="text-2xl font-semibold">Heading 3</h3>
                                    <p className="text-sm text-muted-foreground">text-2xl font-semibold</p>
                                </div>
                                <div>
                                    <h4 className="text-xl font-medium">Heading 4</h4>
                                    <p className="text-sm text-muted-foreground">text-xl font-medium</p>
                                </div>
                                <div>
                                    <p className="text-base">Body text - The quick brown fox jumps over the lazy dog</p>
                                    <p className="text-sm text-muted-foreground">text-base</p>
                                </div>
                                <div>
                                    <p className="text-sm">Small text - The quick brown fox jumps over the lazy dog</p>
                                    <p className="text-sm text-muted-foreground">text-sm</p>
                                </div>
                            </CardContent>
                        </Card>
                    </section>

                    {/* Buttons */}
                    <section className="space-y-4">
                        <h2 className="text-2xl font-semibold">Buttons</h2>
                        <Card>
                            <CardContent className="pt-6 space-y-6">
                                <div className="space-y-2">
                                    <p className="text-sm font-medium">Variants</p>
                                    <div className="flex flex-wrap gap-2">
                                        <Button variant="default">Default</Button>
                                        <Button variant="secondary">Secondary</Button>
                                        <Button variant="outline">Outline</Button>
                                        <Button variant="ghost">Ghost</Button>
                                        <Button variant="destructive">Destructive</Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-sm font-medium">Sizes</p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button size="sm">Small</Button>
                                        <Button size="default">Default</Button>
                                        <Button size="lg">Large</Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-sm font-medium">States</p>
                                    <div className="flex flex-wrap gap-2">
                                        <Button>Normal</Button>
                                        <Button disabled>Disabled</Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </section>

                    {/* Inputs */}
                    <section className="space-y-4">
                        <h2 className="text-2xl font-semibold">Inputs</h2>
                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Default Input</label>
                                    <Input placeholder="Enter text..." />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Disabled Input</label>
                                    <Input placeholder="Disabled" disabled />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Email Input</label>
                                    <Input type="email" placeholder="email@example.com" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Password Input</label>
                                    <Input type="password" placeholder="••••••••" />
                                </div>
                            </CardContent>
                        </Card>
                    </section>

                    {/* Cards */}
                    <section className="space-y-4">
                        <h2 className="text-2xl font-semibold">Cards</h2>
                        <div className="grid gap-4 md:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Card Title</CardTitle>
                                    <CardDescription>Card description goes here</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm">This is the card content area.</p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Another Card</CardTitle>
                                    <CardDescription>With different content</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm">Cards are versatile containers for content.</p>
                                </CardContent>
                            </Card>
                        </div>
                    </section>

                    {/* Badges */}
                    <section className="space-y-4">
                        <h2 className="text-2xl font-semibold">Badges</h2>
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex flex-wrap gap-2">
                                    <Badge variant="default">Default</Badge>
                                    <Badge variant="secondary">Secondary</Badge>
                                    <Badge variant="outline">Outline</Badge>
                                    <Badge variant="destructive">Destructive</Badge>
                                </div>
                            </CardContent>
                        </Card>
                    </section>

                    {/* Alerts */}
                    <section className="space-y-4">
                        <h2 className="text-2xl font-semibold">Alerts</h2>
                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                <Alert>
                                    <Info className="h-4 w-4" />
                                    <AlertTitle>Default Alert</AlertTitle>
                                    <AlertDescription>
                                        This is a default alert component using standard colors.
                                    </AlertDescription>
                                </Alert>
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Destructive Alert</AlertTitle>
                                    <AlertDescription>
                                        This is a destructive alert for critical errors or warnings.
                                    </AlertDescription>
                                </Alert>
                            </CardContent>
                        </Card>
                    </section>

                    {/* Icons & States */}
                    <section className="space-y-4">
                        <h2 className="text-2xl font-semibold">Icons & States</h2>
                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                                    <CheckCircle2 className="h-5 w-5" />
                                    <span>Success state</span>
                                </div>
                                <div className="flex items-center gap-2 text-destructive">
                                    <XCircle className="h-5 w-5" />
                                    <span>Error state</span>
                                </div>
                                <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                                    <AlertCircle className="h-5 w-5" />
                                    <span>Warning state</span>
                                </div>
                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                    <Info className="h-5 w-5" />
                                    <span>Info state</span>
                                </div>
                            </CardContent>
                        </Card>
                    </section>

                    {/* Mobile Preview Note */}
                    <section className="space-y-4">
                        <h2 className="text-2xl font-semibold">Mobile Responsiveness</h2>
                        <Card>
                            <CardContent className="pt-6">
                                <p className="text-muted-foreground">
                                    All components are fully responsive. Resize your browser window to see how they adapt to different screen sizes.
                                    The design follows a mobile-first approach with breakpoints at sm (640px), md (768px), lg (1024px), and xl (1280px).
                                </p>
                            </CardContent>
                        </Card>
                    </section>

                    {/* API Integration Note */}
                    <section className="space-y-4">
                        <h2 className="text-2xl font-semibold">API Integration</h2>
                        <Card>
                            <CardContent className="pt-6">
                                <p className="text-muted-foreground mb-4">
                                    The application integrates with the following services:
                                </p>
                                <div className="space-y-2">
                                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                        <li><strong>Supabase:</strong> Authentication, Database, and Real-time subscriptions</li>
                                        <li><strong>Google OAuth:</strong> Access to Gmail and Google Drive scopes</li>
                                        <li><strong>Gmail API:</strong> Reading emails and attachments</li>
                                        <li><strong>Google Drive API:</strong> Managing folders and files</li>
                                        <li><strong>Resend:</strong> Sending transactional emails</li>
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>
                    </section>
                </div>
            </main>
        </div>
    )
}
