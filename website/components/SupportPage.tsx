'use client'

import Shell from '@/components/Shell'
import { PageHead, Void } from '@/components/ui'

export default function SupportPage() {
  return (
    <Shell>
      <PageHead
        title="Support"
        highlight="GoldenFlipper"
        sub="If the tools here make you coins, you can help keep them running."
      />
      <div className="card" style={{ padding: '48px 24px' }}>
        <Void
          glyph="♥"
          title="Under construction"
          sub="A way to support the project is coming soon — check back shortly."
        />
      </div>
    </Shell>
  )
}
