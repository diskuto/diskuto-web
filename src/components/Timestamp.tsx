// @ts-types="@types/luxon"
import { DateTime, Duration, FixedOffsetZone, type DurationObjectUnits } from "luxon"
import * as pb from "@diskuto/client/types"
import { UserID, Signature } from "@diskuto/client"

type TimestampProps = {
    item: pb.Item,
    userId?: UserID,
    signature?: Signature,

    /**
     * Should we display relative timestamps? (default: true)
     */
    relative?: boolean
}

export default function Timestamp({item, userId, signature, relative}: TimestampProps) {
    const dt = dateFrom(item)
    relative ??= true

    const maxRelative = Duration.fromMillis(60_000 * 60 * 24 * 2) // 2 days
    const minDate = DateTime.local().minus(maxRelative)
    const relativeTime = dt.diffNow()
    let readable: string;
    if (dt.valueOf() < minDate.valueOf() || !relative) {
        readable = dt.toFormat("ff")
    } else {
        readable = relativeDuration(relativeTime)
    }

    const isoDate = dt.toISO() ?? "date format error"
    const title = isoDate + "\nutc-ms: " + dt.valueOf()

    let href = undefined
    if (userId && signature) {
        href = `/u/${userId}/i/${signature}/`
    }

    return <time dateTime={isoDate}>
        <a {...{title,href}} rel="bookmark">{readable}</a>
    </time>
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
