import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    gradient?: boolean;
}

export function Card({ className, gradient, children, ...props }: CardProps) {
    return (
        <div
            className={cn(
                "relative bg-[#0E0E14] border border-white/5 rounded-2xl p-6 transition-all duration-300 hover:border-white/10",
                gradient && "overflow-hidden",
                className
            )}
            {...props}
        >
            {gradient && (
                <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2" />
            )}
            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
}

export function CardTitle({ className, children, icon }: { className?: string, children: React.ReactNode, icon?: React.ReactNode }) {
    return (
        <div className={cn("flex items-center gap-2.5 mb-6", className)}>
            {icon && <span className="text-indigo-400">{icon}</span>}
            <h3 className="text-sm font-semibold tracking-wide text-zinc-100 uppercase">{children}</h3>
        </div>
    );
}
