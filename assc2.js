const fs = require('fs');
const shell = require('shelljs');
const current_date = new Date();

(async _ => {
    let exit_condition = false;
    for (executable of ['zfs']) {
        if (!shell.which(executable)) {
            shell.echo(`Sorry, this script requires: ${executable}`);
        }
    }
    if (exit_condition) {
        shell.exit(1);
    }

    let argv = require('yargs/yargs')(require('yargs/yargs').hideBin(process.argv))
        .describe('config', 'configfile to use')
        .default('config', '/etc/assc2/config.json')
        .epilog('(C) 2021')
        .argv;

    let config;
    try {
        config = JSON.parse(fs.readFileSync(argv.config, 'utf8'));
    } catch (e) {
        shell.echo(`Unable to load config file: ${argv.config}`);
        shell.echo(e);
        shell.exit(1);
    }

    for (const zfs_config of config.zfs) {
        const results = shell.exec(`zfs list -t snapshot -o name,de.engelhardt-itc:assc2-interval -H ${zfs_config.dataset}`, { silent: true });
        if (results.code !== 0) {
            shell.echo(results.stderr);
        } else {
            let snapshots = results.stdout
                // Split by newline
                .split("\n")
                .map(row => row
                    // Split line by tab
                    .split("\t"))
                // Keep only lines with 2 entries
                .filter(row => row.length == 2)
                .map(row => [row[0], row[1]
                    // Split interval by ,
                    .split(",")
                ])
                // Keep only lines which have at least one interval
                .filter(row => row[1].length > 0)
                // Convert line into object
                .map(row => ({
                    "date": (name => {
                        // Constructed with https://regex101.com/r/vBGLXi/2 to match zfs-test/data@UTC-2021.02.03-16.38.35
                        const snapshot_regex = new RegExp(`^${zfs_config.dataset}@UTC-(?<year>\\d{4}).(?<month>\\d{2}).(?<day>\\d{2})-(?<hour>\\d{2}).(?<minute>\\d{2}).(?<second>\\d{2})$`);
                        const match = snapshot_regex.exec(name);
                        if (match !== null) {
                            const ts = match.groups;
                            return new Date(`${ts.year}-${ts.month}-${ts.day}T${ts.hour}:${ts.minute}:${ts.second}Z`);
                        }
                        return null;
                    })(row[0]),
                    "name": row[0],
                    "intervals": row[1],
                    "retention": []
                }))
                // Filter snapshots, where the date could not be converted trough the regex
                .filter(snapshot => snapshot.date !== null);

            let current_snapshot_intervals = [];
            for (const [id, options] of Object.entries(zfs_config.intervals)) {

                const interval_snaps = snapshots
                    // only snapshots which are part of the current id
                    .filter(snapshot => snapshot.intervals.includes(id))
                    // order by date, last snapshot is latest
                    .sort((a, b) => a.date.getTime() - b.date.getTime());

                let interval_snaps_count = interval_snaps.length;
                if (interval_snaps_count == 0) {
                    // No snapshot existing, create one
                    current_snapshot_intervals.push(id);
                    // No retention for this interval neccessary
                    continue;
                } else if ((Math.round((current_date - interval_snaps[interval_snaps.length - 1].date) / (1000 * 60))) >= options.interval) {
                    // The age of the latest snapshot is older/equal to the interval minutes
                    //console.log(`Adding snapshot for ${id}, because ${interval_snaps[interval_snaps.length - 1].date} [${(Math.floor((current_date - interval_snaps[interval_snaps.length - 1].date) / (1000 * 60)))}]`)
                    current_snapshot_intervals.push(id);
                    ++interval_snaps_count;
                }

                if (options.keep < 0) {
                    // retention for interval disabled
                    continue;
                }

                const retention_count = interval_snaps_count - options.keep;
                for (let i = 0; i < retention_count; ++i) {
                    // mark snapshot with intervals to be deleted
                    interval_snaps[i].intervals = interval_snaps[i].intervals.filter(x => x !== id);
                    interval_snaps[i].retention.push(id);
                }
            }

            // Create a new snapshot if required
            if (current_snapshot_intervals.length > 0) {
                const intervals = current_snapshot_intervals.join(",");
                const a = current_date;
                const snapshot_datestring = `UTC-${a.getUTCFullYear()}.${(a.getUTCMonth() + 1).toString().padStart(2, 0)}.${a.getUTCDate().toString().padStart(2, 0)}-${a.getUTCHours().toString().padStart(2, 0)}-${a.getUTCMinutes().toString().padStart(2, 0)}-${a.getUTCSeconds().toString().padStart(2, 0)}`;
                const result = shell.exec(`zfs snapshot -o de.engelhardt-itc:assc2-interval=${intervals} ${zfs_config.dataset}@${snapshot_datestring}`, { silent: false });
                // TODO - Handle Error case console.log(result);
            }

            for (snapshot of snapshots.filter(snapshot => snapshot.retention.length > 0)) {
                if (snapshot.intervals.length > 0) {
                    // Update snapshot interval property
                    const result = shell.exec(`zfs set de.engelhardt-itc:assc2-interval=${snapshot.intervals.join(",")} ${snapshot.name}`)
                } else {
                    const result = shell.exec(`zfs destroy ${snapshot.name}`)
                }
            }
        }
    }
})();
