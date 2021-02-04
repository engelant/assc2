# assc2 (auto-snapshot-shadow_copy2)
**Only supports ZFS right now.**

## Warning
Right now I'd call it an **ALPHA** at best.
Concider this an early share for preview and testing.
Also, packaging the executable results in a ~70MB filesize (nodejs), so yeah, sorry 'bout that.

## Description
A per volume automated snapshot tool with configurable snapshot intervals and retention policies. So like:
 * every minute, keep last 30 (30min)
 * every 5 minutes, keep last 24 (120min => 2h)
 * every 10 minutes, keep last 24 (240min => 4h)
 * every hour, keep last 24 (1140min => 24h => 1d)
 * every day, keep last 28 (28d ~ 1/13y)
 * every 364 days, keep last 11 (4004d ~ 11y)

The goal was to create a solution, that is compatible with the samba4 vss [shadow_copy2](https://www.samba.org/samba/docs/current/man-html/vfs_shadow_copy2.8.html).
This way there is an easy user servicable backup, which is accessable trough the windows file shares.
This also is a great way to give ransomware the finger, especially with folder redirection + roaming profiles.

### How it works
A config.json describes the zfs datasets to be snapshotted. assc2 is called by cron every minute and does a zfs list on the snapshots for the configured dataset. This list is then parsed and filtered to fetch snapshots which follow the naming format ***zfs-test/data*@UTC-2021.02.04-00-35-01** (*zfs-test/data* being your zfs dataset) and have the custom property **de.engelhardt-itc:assc2-interval**.

Every snapshot for assc2 must have at least one interval id to be valid. Multiple internal ids can be stored by using a `,` as seperator. They represent the snapshot being part of the interval id (e.g. 1min). The id is just a label, but it must be a uique key in the intervals config object.

Every minute assc2 collects the snapshots and checks for every id, when the last snapshot was taken. If its longer/equal than the interval for the ID, then this ID requires a new snapshot. This is done for all IDs in the config and if at least one ID requres a snapshot, a snapshot is taken and the requireing ID(s) assigned to it.

This looks something like this:
```
NAME                                   DE.ENGELHARDT-ITC:ASSC2-INTERVAL
zfs-test/data@UTC-2021.02.04-04-50-01  1min,5min,10min,1hour,1day,28days,1year
zfs-test/data@UTC-2021.02.04-04-51-01  1min
zfs-test/data@UTC-2021.02.04-04-52-01  1min
zfs-test/data@UTC-2021.02.04-04-53-01  1min
zfs-test/data@UTC-2021.02.04-04-54-01  1min
zfs-test/data@UTC-2021.02.04-04-55-01  1min,5min
zfs-test/data@UTC-2021.02.04-04-56-01  1min
zfs-test/data@UTC-2021.02.04-04-57-01  1min
zfs-test/data@UTC-2021.02.04-04-58-01  1min
zfs-test/data@UTC-2021.02.04-04-59-01  1min
zfs-test/data@UTC-2021.02.04-05-00-01  1min,5min,10min
zfs-test/data@UTC-2021.02.04-05-01-02  1min
zfs-test/data@UTC-2021.02.04-05-02-01  1min
...
```

After that retention is performed by determining the ammount of snapshots per id. If the ammount of snapshhots is larger than configured for the ID in the config file (*keep*), then tha id is removed from the oldest snapshot. If that snapshot has no IDs left after that it's deleted.

So after a while it starts looking more like this:
```
NAME                                   DE.ENGELHARDT-ITC:ASSC2-INTERVAL
zfs-test/data@UTC-2021.02.04-04-50-01  1hour,1day,28days,1year
zfs-test/data@UTC-2021.02.04-05-50-01  1hour
zfs-test/data@UTC-2021.02.04-06-50-01  1hour
zfs-test/data@UTC-2021.02.04-07-50-01  1hour
zfs-test/data@UTC-2021.02.04-08-40-01  10min
zfs-test/data@UTC-2021.02.04-08-50-01  10min,1hour
zfs-test/data@UTC-2021.02.04-09-00-01  10min
zfs-test/data@UTC-2021.02.04-09-10-01  10min
zfs-test/data@UTC-2021.02.04-09-20-01  10min
zfs-test/data@UTC-2021.02.04-09-30-01  10min
zfs-test/data@UTC-2021.02.04-09-40-01  10min
zfs-test/data@UTC-2021.02.04-09-50-01  10min,1hour
zfs-test/data@UTC-2021.02.04-10-00-01  10min
zfs-test/data@UTC-2021.02.04-10-10-01  10min
zfs-test/data@UTC-2021.02.04-10-20-01  10min
zfs-test/data@UTC-2021.02.04-10-30-01  10min
zfs-test/data@UTC-2021.02.04-10-35-01  5min
zfs-test/data@UTC-2021.02.04-10-40-01  5min,10min
zfs-test/data@UTC-2021.02.04-10-45-01  5min
zfs-test/data@UTC-2021.02.04-10-50-02  5min,10min,1hour
zfs-test/data@UTC-2021.02.04-10-55-02  5min
zfs-test/data@UTC-2021.02.04-11-00-01  5min,10min
zfs-test/data@UTC-2021.02.04-11-05-01  5min
zfs-test/data@UTC-2021.02.04-11-10-01  5min,10min
zfs-test/data@UTC-2021.02.04-11-15-01  5min
zfs-test/data@UTC-2021.02.04-11-20-02  5min,10min
zfs-test/data@UTC-2021.02.04-11-25-01  5min
zfs-test/data@UTC-2021.02.04-11-30-01  5min,10min
zfs-test/data@UTC-2021.02.04-11-35-01  5min
zfs-test/data@UTC-2021.02.04-11-40-01  5min,10min
zfs-test/data@UTC-2021.02.04-11-45-01  5min
zfs-test/data@UTC-2021.02.04-11-50-01  5min,10min,1hour
zfs-test/data@UTC-2021.02.04-11-55-01  5min
zfs-test/data@UTC-2021.02.04-12-00-01  5min,10min
zfs-test/data@UTC-2021.02.04-12-01-01  1min
zfs-test/data@UTC-2021.02.04-12-02-01  1min
zfs-test/data@UTC-2021.02.04-12-03-01  1min
zfs-test/data@UTC-2021.02.04-12-04-01  1min
zfs-test/data@UTC-2021.02.04-12-05-01  1min,5min
zfs-test/data@UTC-2021.02.04-12-06-01  1min
zfs-test/data@UTC-2021.02.04-12-07-01  1min
zfs-test/data@UTC-2021.02.04-12-08-02  1min
zfs-test/data@UTC-2021.02.04-12-09-01  1min
zfs-test/data@UTC-2021.02.04-12-10-01  1min,5min,10min
zfs-test/data@UTC-2021.02.04-12-11-01  1min
zfs-test/data@UTC-2021.02.04-12-12-01  1min
zfs-test/data@UTC-2021.02.04-12-13-01  1min
zfs-test/data@UTC-2021.02.04-12-14-01  1min
zfs-test/data@UTC-2021.02.04-12-15-01  1min,5min
zfs-test/data@UTC-2021.02.04-12-16-01  1min
zfs-test/data@UTC-2021.02.04-12-17-02  1min
zfs-test/data@UTC-2021.02.04-12-18-01  1min
zfs-test/data@UTC-2021.02.04-12-19-01  1min
zfs-test/data@UTC-2021.02.04-12-20-01  1min,5min,10min
zfs-test/data@UTC-2021.02.04-12-21-02  1min
zfs-test/data@UTC-2021.02.04-12-22-01  1min
zfs-test/data@UTC-2021.02.04-12-23-01  1min
zfs-test/data@UTC-2021.02.04-12-24-01  1min
zfs-test/data@UTC-2021.02.04-12-25-01  1min,5min
zfs-test/data@UTC-2021.02.04-12-26-01  1min
zfs-test/data@UTC-2021.02.04-12-27-01  1min
zfs-test/data@UTC-2021.02.04-12-28-01  1min
zfs-test/data@UTC-2021.02.04-12-29-01  1min
zfs-test/data@UTC-2021.02.04-12-30-01  1min,5min,10min
```

You can see, that the 1min IDs have been removed from all but the newest 30 snapshots. Same goes for the other intervals. Snapshots which lost all their IDs got deleted.


### Integration with samba4
For a given dataset *zfs-test/data*, which is mounted at /mnt/zfs-test/data the following config enables shadow_copy2 to use the auto generated snapshots. Have a look at the man page on [shadow_copy2](https://www.samba.org/samba/docs/current/man-html/vfs_shadow_copy2.8.html) for more details.

```
[files]
path = /mnt/zfs-test/data/files
...
vfs objects = shadow_copy2
shadow:mountpoint = /mnt/zfs-test/data
shadow:snapdir = .zfs/snapshot
shadow:format = UTC-%Y.%m.%d-%H.%M.%S
shadow:localtime = yes

[other]
path = /mnt/zfs-test/data/other
...
vfs objects = shadow_copy2
shadow:mountpoint = /mnt/zfs-test/data
shadow:snapdir = .zfs/snapshot
shadow:format = UTC-%Y.%m.%d-%H.%M.%S
shadow:localtime = yes
```
