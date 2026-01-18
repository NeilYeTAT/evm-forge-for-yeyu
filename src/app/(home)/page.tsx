import { VanityGenerator } from '@/ui/components/vanity/vanity-generator'

export default function Page() {
  return (
    <div className="container mx-auto py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Vanity Address Generator</h1>
        <p className="euted-foreground mt-2">
          Generate custom EVM addresses locally in your browser. Private keys never leave your
          device.
        </p>
      </div>

      <VanityGenerator />
    </div>
  )
}
