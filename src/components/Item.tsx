import * as pb from "@nfnitloop/feoblog-client/types"
import { UserID, Signature } from "@nfnitloop/feoblog-client"

// @ts-types="@types/luxon"
import { DateTime, Duration, FixedOffsetZone, type DurationObjectUnits } from "luxon"

import * as preact from "preact"
import { markdownToHtml } from "../markdown.ts";

// Thanks to: https://stackoverflow.com/questions/61015445/using-web-components-within-preact-and-typescript
// Allow custom tags in JSX:
declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      "article-body": preact.JSX.HTMLAttributes<HTMLElement>
    }
  }
}

export type ItemAndEntry = {
    item: pb.Item,
    userId: UserID,
    signature: Signature,
}



export default function Item({item}: {item: ItemAndEntry}) {
    let content = ""
    if (item.item.itemType.case == "post") {
        content = item.item.itemType.value.body
    }

    const uid = item.userId.asBase58
    const sig = item.signature.asBase58

    const html = {
        __html: markdownToHtml(content, {relativeBase: `/u/${uid}/i/${sig}/`})
    }


    return <article>
        <header>
            <span>{uid}</span>
            <Timestamp {...item}/>
        </header>
        <article-body dangerouslySetInnerHTML={html}/>
    </article>
}

type TimestampProps = {
    item: pb.Item,
    userId?: UserID,
    signature?: Signature,
}

function Timestamp({item, userId, signature}: TimestampProps) {
    const dt = dateFrom(item)

    const maxRelative = Duration.fromMillis(60_000 * 60 * 24 * 2) // 2 days
    const minDate = DateTime.local().minus(maxRelative)
    const relative = dt.diffNow()
    let readable: string;
    if (dt.valueOf() < minDate.valueOf()) {
        readable = dt.toFormat("ff")
    } else {
        readable = relativeDuration(relative)
    }

    const full = dt.toISO() + "\nutc-ms: " + dt.valueOf()

    let link = undefined
    if (userId && signature) {
        link = `/u/${userId}/i/${signature}/`
    }

    // todo: use <time datetime="...">
    return <span>
        <a title={full} href={link}>{readable}</a>
    </span>
}

function dateFrom(item: pb.Item) {
    const ts = Number.parseInt(item.timestampMsUtc.toString())
    const dateTime = DateTime.fromMillis(ts)
    const zone = FixedOffsetZone.instance(item.utcOffsetMinutes)
    return dateTime.setZone(zone)
}

// See: https://github.com/moment/luxon/issues/1129
// General solution for relative durations. Overkill for my use but fun to implement:
function relativeDuration(duration: Duration, opts?: RelativeDurationOpts): string {
    const sigU = opts?.significantUnits ?? 2
    if (sigU < 1) {
        throw Error("Signficant units can't be < 1")
    }

    let units = opts?.units ?? defaultUnits
    // Make sure units are ordered in descending significance:
    units = allUnits.filter(it => units.includes(it))

    
    const negative = duration.valueOf() < 0
    if (negative) { duration = duration.negate() }
    duration = duration.shiftTo(...units)

    // Remove unnecessary most-significant units:
    while (units.length > 1) {
        if (duration.get(units[0]) > 0) {
            // we've found the most significant unit:
            break
        }

        units = units.slice(1)
        duration = duration.shiftTo(...units)
    }

    units = units.slice(0, sigU)
    duration = duration.shiftTo(...units)
    // If the last unit has fractional bits, we don't care. We're explicitly limiting significant units:
    const lastUnit = units[units.length - 1]
    duration = duration.set({
        [lastUnit]: Math.floor(duration.get(lastUnit))
    })

    const relative = duration.toHuman()
    if (negative) {
        return `${relative} ago`
    } else {
        return `in ${relative}`
    }
}

interface RelativeDurationOpts {
    // Default: 2
    significantUnits?: number

    // Default: all but quarters & months
    units?: (keyof DurationObjectUnits)[]
}

const allUnits: ReadonlyArray<keyof DurationObjectUnits> = ["years", "quarters", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds"]
// No quarters/weeks:
const defaultUnits: ReadonlyArray<keyof DurationObjectUnits> = ["years", "months", "days", "hours", "minutes", "seconds", "milliseconds"]
