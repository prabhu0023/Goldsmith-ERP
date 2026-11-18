# Repository location (EP-01-S1)

Status: **Decided.**

**Where it lives:** the product has its own git repository, `prabhu0023/Goldsmith-ERP` on GitHub (`https://github.com/prabhu0023/Goldsmith-ERP.git`). Its root is the `jewelops---jewellery-enterprise-suite` project folder, so `git rev-parse --show-toplevel` in a clone prints the clone folder.

**Why:** history, branch protection (EP-01-S11) and CI (`.github/workflows/ci.yml`) must attach to the product only. The parent folder `/Users/prabhu.govindaraj/Documents/personalproject` is a separate git repository that holds unrelated sibling projects; keeping the product inside it would mix their history and settings.

**Parent folder:** that parent repository still lists `jewelops---jewellery-enterprise-suite/` as untracked, because it has no ignore rule for it. This is harmless: the product's history is in its own repository. To hide it, the owner of the parent repository can add `jewelops---jewellery-enterprise-suite/` to the parent's `.gitignore`; that change belongs to the parent repository, not to this one.

**Access:** only named developers have write access. Repository administrators (who can change branch protection): prabhu0023. Branch-protection bypass: nobody. Add a name here, with the reason, before giving anyone else administrator rights or bypass.
