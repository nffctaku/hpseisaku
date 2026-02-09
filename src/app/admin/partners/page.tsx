"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { CategoryCard } from "./_components/category-card";
import { PartnersTable } from "./_components/partners-table";
import { PartnerDialog } from "./_components/partner-dialog";
import { DeleteConfirmDialog } from "./_components/confirm-dialogs";
import { CategoryDialog } from "./_components/category-dialog";

type PartnerCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

const DEFAULT_PARTNER_CATEGORIES: PartnerCategory[] = [
  { id: "top", name: "トップパートナー", sortOrder: 0 },
  { id: "official", name: "オフィシャルパートナー", sortOrder: 1 },
];

const partnerSchema = z.object({
  name: z.string().min(1, "企業名は必須です。"),
  categoryId: z.string().min(1, "カテゴリは必須です。"),
  logoUrl: z.string().url("無効なURLです。").optional().or(z.literal("")),
  linkUrl: z.string().url("無効なURLです。").optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isPublished: z.coerce.boolean().default(false),
});

type PartnerFormValues = z.input<typeof partnerSchema>;
type PartnerParsedValues = z.output<typeof partnerSchema>;

type Partner = {
  id: string;
  name: string;
  categoryId: string;
  legacyCategory?: "top" | "official";
  logoUrl?: string;
  linkUrl?: string;
  sortOrder?: number;
  isPublished?: boolean;
};

export default function PartnersAdminPage() {
  const { user, ownerUid } = useAuth();
  const clubUid = ownerUid || user?.uid;

  const canManagePartners =
    user?.uid === 'gNDzHTPlzVZK8cOl7ogxQBRvugH2' ||
    Boolean(user?.uid && ownerUid && user.uid === ownerUid);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  const [categories, setCategories] = useState<PartnerCategory[]>(DEFAULT_PARTNER_CATEGORIES);
  const [savingSettings, setSavingSettings] = useState(false);

  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<PartnerCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<PartnerCategory | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState<string>("0");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [deleting, setDeleting] = useState<Partner | null>(null);

  const form = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerSchema),
    defaultValues: {
      name: "",
      categoryId: "top",
      logoUrl: "",
      linkUrl: "",
      sortOrder: 0,
      isPublished: false,
    },
  });

  const categoryById = useMemo(() => {
    const map = new Map<string, PartnerCategory>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  const sortedCategories = useMemo(() => {
    const next = [...categories];
    next.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return next;
  }, [categories]);

  const resolveClubProfileRef = async () => {
    if (!clubUid) return null;
    const qRef = query(collection(db, "club_profiles"), where("ownerUid", "==", clubUid), limit(1));
    const qSnap = await getDocs(qRef);
    if (!qSnap.empty) {
      return doc(db, "club_profiles", qSnap.docs[0].id);
    }
    return doc(db, "club_profiles", clubUid);
  };

  useEffect(() => {
    if (!canManagePartners) {
      setPageLoading(false);
      return;
    }
    if (!clubUid) {
      setPageLoading(false);
      return;
    }

    const fetchCategories = async () => {
      try {
        const profileRef = await resolveClubProfileRef();
        if (!profileRef) {
          setCategories(DEFAULT_PARTNER_CATEGORIES);
          return;
        }
        const snap = await getDoc(profileRef);
        const data = snap.exists() ? (snap.data() as any) : null;
        const raw = Array.isArray(data?.partnersCategories) ? (data.partnersCategories as any[]) : null;
        if (raw && raw.length > 0) {
          const next = raw
            .map((x) => ({
              id: typeof x?.id === "string" ? x.id : "",
              name: typeof x?.name === "string" ? x.name : "",
              sortOrder: typeof x?.sortOrder === "number" ? x.sortOrder : 0,
            }))
            .filter((x) => x.id.trim() !== "" && x.name.trim() !== "");
          setCategories(next.length > 0 ? next : DEFAULT_PARTNER_CATEGORIES);
          return;
        }
        setCategories(DEFAULT_PARTNER_CATEGORIES);
      } catch (e) {
        console.error("[PartnersAdminPage] fetch categories failed", e);
      }
    };

    fetchCategories();

    const colRef = collection(db, `clubs/${clubUid}/partners`);

    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as any;

          const legacyCategory = (data?.category === "official" ? "official" : data?.category === "top" ? "top" : undefined) as
            | Partner["legacyCategory"]
            | undefined;
          const rawCategoryId = typeof data?.categoryId === "string" ? data.categoryId : "";
          const categoryId = rawCategoryId.trim() !== "" ? rawCategoryId : legacyCategory || "";

          return {
            id: d.id,
            name: String(data?.name || ""),
            categoryId: categoryId || "uncategorized",
            legacyCategory,
            logoUrl: typeof data?.logoUrl === "string" ? data.logoUrl : "",
            linkUrl: typeof data?.linkUrl === "string" ? data.linkUrl : "",
            sortOrder: typeof data?.sortOrder === "number" ? data.sortOrder : 0,
            isPublished: typeof data?.isPublished === "boolean" ? data.isPublished : false,
          } as Partner;
        });

        list.sort((a, b) => {
          const ca = categoryById.get(a.categoryId)?.sortOrder ?? 9999;
          const cb = categoryById.get(b.categoryId)?.sortOrder ?? 9999;
          if (ca !== cb) return ca - cb;
          return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        });

        setPartners(list);
        setPageLoading(false);
      },
      (error) => {
        console.error("[PartnersAdminPage] onSnapshot error", error);
        toast.error(
          (error as any)?.code === "permission-denied"
            ? "パートナーの取得に失敗しました（permission-denied）。権限設定をご確認ください。"
            : "パートナーの取得に失敗しました。"
        );
        setPageLoading(false);
      }
    );

    return () => unsub();
  }, [clubUid]);

  const persistPartnerCategories = async (nextCategories: PartnerCategory[]) => {
    if (!clubUid) return;
    setSavingSettings(true);
    try {
      const payload = {
        partnersCategories: [...nextCategories]
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((c) => ({
            id: c.id,
            name: c.name,
            sortOrder: c.sortOrder ?? 0,
          })),
        updatedAt: serverTimestamp(),
      } as any;

      const profileRef = await resolveClubProfileRef();
      if (!profileRef) return;
      const snap = await getDoc(profileRef);
      if (snap.exists()) {
        await updateDoc(profileRef, payload);
      } else {
        await setDoc(
          profileRef,
          {
            ownerUid: clubUid,
            ...payload,
          } as any,
          { merge: true }
        );
      }
    } catch (e) {
      console.error("[PartnersAdminPage] save categories failed", e);
      toast.error("カテゴリの保存に失敗しました。");
    } finally {
      setSavingSettings(false);
    }
  };

  const groupedCounts = useMemo(() => {
    return { total: partners.length };
  }, [partners]);

  const openCategoryCreate = () => {
    if (sortedCategories.length >= 5) {
      toast.error("カテゴリは最大5件までです。");
      return;
    }
    setEditingCategory(null);
    setCategoryName("");
    setCategorySortOrder(String(sortedCategories.length));
    setIsCategoryDialogOpen(true);
  };

  const openCategoryEdit = (c: PartnerCategory) => {
    setEditingCategory(c);
    setCategoryName(c.name);
    setCategorySortOrder(String(c.sortOrder ?? 0));
    setIsCategoryDialogOpen(true);
  };

  const saveCategory = () => {
    const name = categoryName.trim();
    const sortOrder = Number(categorySortOrder);
    if (!name) {
      toast.error("カテゴリ名を入力してください。");
      return;
    }

    const safeSort = Number.isFinite(sortOrder) ? Math.max(0, Math.min(9999, sortOrder)) : 0;

    if (editingCategory) {
      const next = categories.map((x) => (x.id === editingCategory.id ? { ...x, name, sortOrder: safeSort } : x));
      setCategories(next);
      setIsCategoryDialogOpen(false);
      void persistPartnerCategories(next);
      return;
    }

    if (categories.length >= 5) {
      toast.error("カテゴリは最大5件までです。");
      return;
    }

    const idBase = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "")
      .slice(0, 24);
    const base = idBase || `cat-${Date.now()}`;

    let nextId = base;
    let i = 2;
    while (categoryById.has(nextId)) {
      nextId = `${base}-${i}`;
      i += 1;
    }

    const next = [...categories, { id: nextId, name, sortOrder: safeSort }];
    setCategories(next);
    setIsCategoryDialogOpen(false);
    void persistPartnerCategories(next);
  };

  const confirmDeleteCategory = () => {
    if (!deletingCategory) return;
    const id = deletingCategory.id;

    const used = partners.some((p) => p.categoryId === id);
    if (used) {
      toast.error("このカテゴリを使っているパートナーがあるため削除できません。");
      setDeletingCategory(null);
      return;
    }

    const next = categories.filter((x) => x.id !== id);
    setCategories(next);
    setDeletingCategory(null);
    void persistPartnerCategories(next);
  };

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "", categoryId: sortedCategories[0]?.id ?? "top", logoUrl: "", linkUrl: "", sortOrder: 0, isPublished: false });
    setIsDialogOpen(true);
  };

  const openEdit = (p: Partner) => {
    setEditing(p);
    form.reset({
      name: p.name,
      categoryId: p.categoryId,
      logoUrl: p.logoUrl || "",
      linkUrl: p.linkUrl || "",
      sortOrder: p.sortOrder ?? 0,
      isPublished: Boolean(p.isPublished),
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (values: PartnerFormValues) => {
    if (!clubUid) return;
    setSaving(true);
    try {
      const parsed: PartnerParsedValues = partnerSchema.parse(values);
      const payload = {
        name: parsed.name,
        categoryId: parsed.categoryId,
        logoUrl: (parsed.logoUrl || "").trim(),
        linkUrl: (parsed.linkUrl || "").trim(),
        sortOrder: parsed.sortOrder ?? 0,
        isPublished: Boolean(parsed.isPublished),
        updatedAt: serverTimestamp(),
      } as any;

      if (editing) {
        await updateDoc(doc(db, `clubs/${clubUid}/partners`, editing.id), payload);
        toast.success("パートナーを更新しました。");
      } else {
        await addDoc(collection(db, `clubs/${clubUid}/partners`), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast.success("パートナーを追加しました。");
      }
      setIsDialogOpen(false);
    } catch (e) {
      console.error("[PartnersAdminPage] save failed", e);
      toast.error("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!clubUid || !deleting) return;
    try {
      await deleteDoc(doc(db, `clubs/${clubUid}/partners`, deleting.id));
      toast.success("削除しました。");
    } catch (e) {
      console.error("[PartnersAdminPage] delete failed", e);
      toast.error("削除に失敗しました。");
    } finally {
      setDeleting(null);
    }
  };

  if (!canManagePartners) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-sm text-muted-foreground">権限がありません。</div>
      </div>
    );
  }

  if (pageLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">パートナー管理</h1>
            <p className="text-sm text-white/70 mt-1">登録数: {groupedCounts.total}</p>
          </div>
          <Button className="bg-blue-600 text-white hover:bg-blue-700 hover:text-white h-11 px-6 shadow-lg shadow-blue-600/20" onClick={openCreate}>
            新規追加
          </Button>
        </div>

        <CategoryCard
          sortedCategories={sortedCategories}
          onAdd={openCategoryCreate}
          onEdit={openCategoryEdit}
          onDelete={setDeletingCategory}
          saving={savingSettings}
          addDisabled={sortedCategories.length >= 5}
        />

        <PartnersTable
          partners={partners}
          getCategoryName={(categoryId) => categoryById.get(categoryId)?.name ?? "（未分類）"}
          onEdit={(p) => openEdit(p as any)}
          onDelete={(p) => setDeleting(p as any)}
        />

        <PartnerDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          editing={Boolean(editing)}
          form={form}
          saving={saving}
          categories={sortedCategories.map((c) => ({ id: c.id, name: c.name }))}
          onSubmit={form.handleSubmit(onSubmit)}
        />

        <DeleteConfirmDialog
          open={!!deleting}
          title="削除の確認"
          name={deleting?.name}
          onOpenChange={(v) => (!v ? setDeleting(null) : null)}
          onConfirm={confirmDelete}
        />

        <CategoryDialog
          open={isCategoryDialogOpen}
          onOpenChange={setIsCategoryDialogOpen}
          editing={Boolean(editingCategory)}
          categoryName={categoryName}
          setCategoryName={setCategoryName}
          categorySortOrder={categorySortOrder}
          setCategorySortOrder={setCategorySortOrder}
          onSave={saveCategory}
        />

        <DeleteConfirmDialog
          open={!!deletingCategory}
          title="削除の確認"
          name={deletingCategory?.name}
          onOpenChange={(v) => (!v ? setDeletingCategory(null) : null)}
          onConfirm={confirmDeleteCategory}
        />
      </div>
    </div>
  );
}
