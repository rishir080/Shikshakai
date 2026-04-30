'use client';

interface HeaderProps {
    title: string;
    subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
    return (
        <div className="mb-8">
            <h1 className="font-serif text-4xl text-white tracking-tight leading-none mb-2">
                {title}
            </h1>
            {subtitle && (
                <p className="text-zinc-500 text-sm font-medium tracking-wide">
                    {subtitle}
                </p>
            )}
        </div>
    );
}
