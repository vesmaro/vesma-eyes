# vesmaro-eyes deploy JOURNAL — append-only audit trail (AGW-10)
# date | actor | action | helm rev before>after | image tag | chart version | HEAD
2026-09-24T00:49:02+0300 | abyss@core-51 | deploy | rev 67>68 | image 1.33.0 | chart 1.33.0 | HEAD ccdd864 | allow-drift: release bump 1.32.0->1.33.0: live несёт прошлый image.tag — единственный не-секретный дрейф (штатный релизный путь, см. AGW-10)
2026-09-24T02:01:10+0300 | gcw-git-workflow-specialist@release-1.34.0 | deploy | rev 68>69 | image 1.34.0 | chart 1.34.0 | HEAD 62053dd | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-24T02:17:28+0300 | abyss@core-51 | deploy | rev 69>70 | image 1.35.0 | chart 1.35.0 | HEAD 15b20bf | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-24T03:41:48+0300 | abyss@core-51 | deploy | rev 70>71 | image 1.36.0 | chart 1.36.0 | HEAD ccbc534 | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-25T00:19:11+0300 | abyss@core-51 | deploy | rev 71>72 | image 1.37.0 | chart 1.37.0 | HEAD 63ad22b | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-25T00:44:46+0300 | abyss@core-51 | deploy | rev 72>73 | image 1.37.1 | chart 1.37.1 | HEAD d079ea6 | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-27T06:20:50+0300 | abyss@core-51 | repair | rev 75>76 | image 1.38.0 | chart 1.38.0 | HEAD f6910f1
2026-09-27T08:31:25+0300 | abyss@core-51 | deploy | rev 76>77 | image 1.39.0 | chart 1.39.0 | HEAD ad8ea2c | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-27T18:10:31+0300 | abyss@core-51 | deploy | rev 77>78 | image 1.39.1 | chart 1.39.1 | HEAD ae963a8 | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-27T19:07:06+0300 | abyss@core-51 | deploy | rev 78>79 | image 1.40.0 | chart 1.40.0 | HEAD 3d6c19d | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-28T01:17:08+0300 | abyss@core-51 | deploy | rev 79>80 | image 1.41.0 | chart 1.41.0 | HEAD e42310a | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-28T11:45:36+0300 | abyss@core-51 | deploy | rev 80>81 | image 1.42.0 | chart 1.42.0 | HEAD 44eefee | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-28T18:35:38+0300 | abyss@core-51 | deploy | rev 81>82 | image 1.43.0 | chart 1.43.0 | HEAD 69fda95 | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-28T23:36:47+0300 | gcw-release-lane@core-51 | deploy | rev 82>83 | image 1.44.0 | chart 1.44.0 | HEAD 154d70c | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-29T08:52:52+0300 | gcw-release-lane@core-51 | deploy | rev 83>84 | image 1.45.0 | chart 1.45.0 | HEAD 6209205 | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-29T13:03:18+0300 | sre-devops-gcw@recovery | rollback | rev 86>87 | image 1.45.0 | chart 1.47.0 | HEAD f5d24a4
2026-09-29T13:05:00+0300 | sre-devops-gcw@recovery | incident ghcr-403-pull-secret (2nd occurrence) | rev 85>87 | image 1.45.0 | chart 1.47.0 | HEAD 06b12cd | prod down ~2h: ghcr-pull token revoked/expired (403 on image pull, ImagePullBackOff); parallel operator rotated ghcr-pull in place from host-podman auth (pod resumed 12:28 +0300, 1.45.0 healthy); both ghcr-pull and ghcr-pull-w26 verified HTTP 200 against ghcr.io token endpoint; imagePullSecrets now list BOTH secrets (chart values + legacy k8s manifest + RUNBOOK) — closes noted-gap: single pull secret was a SPOF
2026-09-29T13:06:31+0300 | sre-devops-gcw@recovery | deploy | rev 87>88 | image 1.47.0 | chart 1.47.0 | HEAD 545460c | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-29T13:42:16+0300 | abyss@core-51 | deploy | rev 88>89 | image 1.48.0 | chart 1.48.0 | HEAD a69dac4 | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
2026-09-29T14:16:34+0300 | abyss@core-51 | deploy | rev 89>90 | image 1.49.0 | chart 1.49.0 | HEAD 3a96bcb | auto-waived: image.tag drift = previous release (deployed-revision appVersion)
