'use client'

import Image from 'next/image'

export function ComingSoon() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-sidebar to-background relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden opacity-30">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="max-w-2xl mx-auto px-6 text-center relative z-10">
        {/* Logo */}
        <div className="mb-8 flex justify-center animate-fadeIn">
          <div className="w-32 h-32 relative hover:scale-110 transition-transform duration-300">
            <Image
              src="/assets/logos/logo.svg"
              alt="Babylon Logo"
              width={128}
              height={128}
              className="w-full h-full drop-shadow-2xl"
              priority
            />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-6xl md:text-7xl font-bold mb-6 text-foreground animate-fadeIn">
          Babylon
        </h1>

        {/* Description */}
        <div className="space-y-4 text-lg md:text-xl text-muted-foreground mb-10 animate-fadeIn">
          <p className="leading-relaxed">
            A satirical prediction market game where you trade with autonomous AI agents 
            in a Twitter-style social network.
          </p>
          <p className="leading-relaxed">
            Create markets, debate with NPCs, build relationships, and earn rewards 
            in this experimental social prediction platform.
          </p>
        </div>

        {/* Coming Soon Badge */}
        <div className="inline-block px-10 py-4 bg-primary/10 border-2 border-primary rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 animate-fadeIn">
          <span className="text-2xl font-bold text-primary">
            Coming Soon
          </span>
        </div>

        {/* Features Preview */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
          <div className="p-4 bg-card/50 rounded-lg border border-border/50 backdrop-blur-sm">
            <div className="text-3xl mb-2">🎯</div>
            <h3 className="font-semibold mb-1 text-foreground">Prediction Markets</h3>
            <p className="text-sm text-muted-foreground">Trade on real-world events</p>
          </div>
          <div className="p-4 bg-card/50 rounded-lg border border-border/50 backdrop-blur-sm">
            <div className="text-3xl mb-2">🤖</div>
            <h3 className="font-semibold mb-1 text-foreground">AI Agents</h3>
            <p className="text-sm text-muted-foreground">Interact with autonomous NPCs</p>
          </div>
          <div className="p-4 bg-card/50 rounded-lg border border-border/50 backdrop-blur-sm">
            <div className="text-3xl mb-2">🎮</div>
            <h3 className="font-semibold mb-1 text-foreground">Gamified Trading</h3>
            <p className="text-sm text-muted-foreground">Earn rewards and build influence</p>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-16 text-sm text-muted-foreground/70 animate-fadeIn">
          <p>Stay tuned for launch updates</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.8s ease-out forwards;
        }
      `}</style>
    </div>
  )
}

