import { useEffect, useMemo, useState } from "react";
import { Bookmark, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  normalizeScannerName,
  scannerCriteriaEqual,
  useSavedScanners,
  type SavedScannerCriteria,
} from "@/lib/user-library";

export function SavedScannerControls({
  criteria,
  onApply,
}: {
  criteria: SavedScannerCriteria;
  onApply: (criteria: SavedScannerCriteria) => void;
}) {
  const saved = useSavedScanners();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const active = saved.items.find((item) => item.id === activeId) ?? null;
  const dirty = active ? !scannerCriteriaEqual(active.criteria, criteria) : false;

  useEffect(() => {
    if (activeId && !saved.items.some((item) => item.id === activeId)) {
      setActiveId(null);
    }
  }, [activeId, saved.items]);

  const suggestedName = useMemo(() => {
    if (criteria.preset) {
      const labels: Record<string, string> = {
        "trading-value-surge": "거래대금 급증",
        "up-with-volume": "상승과 거래대금 증가",
        "down-with-volume": "하락과 거래대금 증가",
        "sector-leader": "섹터 주도주",
        "large-cap-interest": "대형주 관심 확대",
      };
      return labels[criteria.preset] ?? "저장 스캐너";
    }
    return `${criteria.period.toUpperCase()} 기준 스캐너`;
  }, [criteria.period, criteria.preset]);

  const openCreate = () => {
    setName(suggestedName);
    setNameError("");
    setDialogMode("create");
  };

  const openRename = () => {
    if (!active) return;
    setName(active.name);
    setNameError("");
    setDialogMode("rename");
  };

  const submitName = () => {
    const normalized = normalizeScannerName(name);
    if (!normalized) {
      setNameError("이름을 입력해 주세요.");
      return;
    }
    const result =
      dialogMode === "rename" && active
        ? saved.rename(active.id, normalized)
        : saved.save(normalized, criteria);
    if (!result.ok) {
      setNameError(
        result.reason === "duplicate-name"
          ? "같은 이름의 저장 스캐너가 있습니다."
          : result.reason === "limit"
            ? "저장 스캐너는 최대 100개까지 만들 수 있습니다."
          : "스캐너를 저장할 수 없습니다.",
      );
      return;
    }
    if (result.item) setActiveId(result.item.id);
    setDialogMode(null);
    const message =
      dialogMode === "rename"
        ? `이름을 ${normalized}(으)로 변경했습니다.`
        : `${normalized} 스캐너를 저장했습니다.`;
    result.persistent
      ? toast.success(message)
      : toast.warning(message, {
          description: "브라우저 저장 공간을 사용할 수 없어 이번 세션에만 유지됩니다.",
        });
  };

  const saveCurrent = () => {
    if (!active) {
      openCreate();
      return;
    }
    if (!dirty) return;
    const result = saved.save(active.name, criteria, active.id);
    if (!result.ok) {
      toast.error("변경사항을 저장할 수 없습니다.");
    } else if (result.persistent) {
      toast.success(`${active.name}의 변경사항을 저장했습니다.`);
    } else {
      toast.warning(`${active.name}의 변경사항을 이번 세션에만 저장했습니다.`);
    }
  };

  return (
    <div
      role="group"
      className="flex flex-wrap items-center gap-2"
      aria-label="저장된 스캐너 관리"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" aria-label={`저장된 스캐너 ${saved.items.length}개`}>
            <Bookmark className="h-4 w-4" />
            저장된 스캐너 {saved.items.length}개
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {saved.items.length === 0 ? (
            <DropdownMenuItem disabled>저장된 조건이 없습니다</DropdownMenuItem>
          ) : (
            saved.items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={() => {
                  setActiveId(item.id);
                  onApply(item.criteria);
                  toast.success(`${item.name} 조건을 불러왔습니다.`);
                }}
                className="min-h-10"
              >
                <Bookmark className={activeId === item.id ? "fill-current text-brand" : ""} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {activeId === item.id && <span className="text-[10px] text-brand">적용됨</span>}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        size="sm"
        onClick={saveCurrent}
        disabled={Boolean(active && !dirty)}
      >
        <Bookmark className={active && !dirty ? "fill-current" : ""} />
        {active ? (dirty ? "변경사항 저장" : "저장됨") : "현재 조건 저장"}
      </Button>

      {active && (
        <>
          <Button type="button" variant="ghost" size="sm" onClick={openRename}>
            <Pencil className="h-4 w-4" /> 이름 변경
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="text-danger hover:text-danger"
          >
            <Trash2 className="h-4 w-4" /> 삭제
          </Button>
        </>
      )}

      {saved.notice && (
        <span role="status" className="basis-full text-xs text-warning">
          {saved.notice}
        </span>
      )}

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === "rename" ? "저장 스캐너 이름 변경" : "현재 스캐너 조건 저장"}</DialogTitle>
            <DialogDescription>
              검색어, 필터, 비교 기간과 정렬 조건을 이 브라우저에 저장합니다.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitName();
            }}
          >
            <label htmlFor="saved-scanner-name" className="text-sm font-medium">
              이름
            </label>
            <Input
              id="saved-scanner-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameError("");
              }}
              maxLength={50}
              autoFocus
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? "saved-scanner-name-error" : undefined}
              className="mt-2"
            />
            {nameError && (
              <p id="saved-scanner-name-error" role="alert" className="mt-2 text-xs text-danger">
                {nameError}
              </p>
            )}
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setDialogMode(null)}>
                취소
              </Button>
              <Button type="submit">{dialogMode === "rename" ? "이름 변경" : "저장"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>저장된 스캐너를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {active?.name ?? "선택한 스캐너"} 저장값만 삭제합니다. 현재 화면에 적용된 조건은 유지됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!active) return;
                const nameToDelete = active.name;
                const result = saved.remove(active.id);
                if (result.ok) {
                  setActiveId(null);
                  result.persistent
                    ? toast.success(`${nameToDelete} 스캐너를 삭제했습니다.`)
                    : toast.warning(
                        `${nameToDelete} 스캐너를 이번 세션에서만 삭제했습니다.`,
                      );
                } else {
                  toast.error("저장된 스캐너를 삭제할 수 없습니다.");
                }
              }}
              className="bg-danger text-white hover:bg-danger/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
