import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGithub } from '@fortawesome/free-brands-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

export default function BrandIcon({ name }: { name: string }) {
  const [icon, setIcon] = useState<IconDefinition | null>(name.toLowerCase() === 'github' ? faGithub : null)
  useEffect(() => {
    let active = true
    if (name.toLowerCase() === 'github') { setIcon(faGithub); return }
    import('@fortawesome/free-brands-svg-icons').then(icons => {
      const found = Object.values(icons).find(value => typeof value === 'object' && 'iconName' in value && value.iconName === name.toLowerCase())
      if (active) setIcon((found as IconDefinition) ?? null)
    })
    return () => { active = false }
  }, [name])
  return icon ? <FontAwesomeIcon icon={icon} /> : <span aria-hidden="true">↗</span>
}
