/* @jsxImportSource preact */
/* @jsxRuntime automatic */

export type Props = {
    title: string
    /**
     * Where to load the SPA script from.
     * 
     * The script must export a function `mountAt(elementId: string)` which can be called 
     * to mount itself.
     */
    script: string
}

/**
 * Bootstraps a Single-Page Application.
 */
export default function SPA({title, script}: Props) {
    return <html>
        <head>
            <title>{title}</title>
            <link rel="stylesheet" href="/static/style.css"/>
            <meta name="viewport" content="width=device-width"/>
        </head>
        <body id="body">
        </body>
        <EmbedScript path={script}/>
    </html>
}

function EmbedScript({path}: {path: string}) {
    const script = [
        `import {mountAt} from "${path}";`,
        `mountAt("body")`
    ].join("\n")
    return <Script js={script}/>
}

export function Script({js, defer}: {js: string, defer?: boolean}) {
    return <script type="module" defer={defer} dangerouslySetInnerHTML={{__html: js}}/>
}